import { EPG_SOURCE, stripQualityTail, XmltvReader, buildIndex, matchChannel, feedsFor, toListing, eventListings, overlayEvents, type EpgChannel, type ListingRow } from "./real-epg";
import type { TablesInsert } from "@/integrations/supabase/types";
import { categoryFeeds } from './epg-demand';
import type { Json } from '@/integrations/supabase/types';

/** Each feed is refreshed this often; one feed per scheduled run keeps every run small. */
export const FEED_REFRESH_MS = 6 * 3600_000;
const KEEP_BEFORE_MS = 3 * 3600_000;
const KEEP_AHEAD_MS = 36 * 3600_000;

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function playlistTargets() {
  const { playlistAllChannels } = await import("./playlist-source.server");
  const { isEventChannel } = await import("./player-channel-health");
  const { isReplayChannel } = await import("./sports-live-only");
  const all = await playlistAllChannels();
  return all
    .filter((c) => !isEventChannel(stripQualityTail(c.name)) && !isReplayChannel(c.name, c.category))
    .map((c) => ({ ...c, feeds: feedsFor(c.name, c.category) }))
    .filter((c) => c.feeds.length)
    // Duplicate playlist names share one guide match (and one upsert row).
    .filter((c, i, a) => a.findIndex((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase()) === i);
}

/** Legacy scheduled caller must never download countries without demand. */
export async function importNextFeed(nowMs = Date.now()) {
  const db = await admin();
  const { error } = await db.rpc('dispatch_epg_demand');
  if (error) throw new Error(error.message);
  return { skipped: 'Demand only', at: nowMs };
}

export async function requestCategoryGuide(category: string) {
  const codes = categoryFeeds(category);
  if (!codes.length) return { queued: 0 };
  const db = await admin();
  const { data, error } = await db.rpc('request_epg_feeds', { p_codes: codes });
  if (error) throw new Error(error.message);
  return { queued: data ?? 0 };
}

export async function importFeed(code: string, targets?: Awaited<ReturnType<typeof playlistTargets>>, nowMs = Date.now(), wake?: string) {
  const db = await admin();
  const { data: run, error: claimError } = await db.rpc('claim_epg_feed', { p_code: code, ...(wake ? { p_wake: wake } : {}) });
  if (claimError) throw new Error(claimError.message);
  if (!run) return { skipped: 'Already updating or invalid wake' };
  try {
    targets ??= await playlistTargets();
    const mine = targets.filter((t) => t.feeds.includes(code));
    if (!mine.length) throw new Error('No playlist channels for this feed');
    const res = await fetch(`${EPG_SOURCE}${code}.xml.gz`, { signal: AbortSignal.timeout(50_000) });
    if (!res.ok || !res.body) throw new Error(`Guide download failed (${res.status})`);
    const channels: EpgChannel[] = [];
    let wantedIds: Set<string> | null = null;
    const matches = new Map<string, string>();
    const progs: { feed: string; epg_id: string; start_at: string; stop_at: string; title: string; descr: string }[] = [];
    const existing: { channel_key: string; feed: string | null; epg_id: string | null; manual: boolean; disabled: boolean }[] = [];
    for (let i = 0; i < mine.length; i += 100) {
      const { data, error } = await db.from("epg_channel_map").select("channel_key, feed, epg_id, manual, disabled").in("channel_key", mine.slice(i, i + 100).map((t) => t.name.trim().toLowerCase()));
      if (error) throw new Error(error.message);
      existing.push(...(data ?? []));
    }
    const prior = new Map((existing ?? []).map((r) => [r.channel_key, r]));
    const decide = () => {
      const idx = buildIndex(channels);
      wantedIds = new Set();
      for (const t of mine) {
        const key = t.name.trim().toLowerCase();
        const p = prior.get(key);
        if (p?.manual) { if (p.feed === code && p.epg_id && !p.disabled) wantedIds.add(p.epg_id); continue; }
        const id = matchChannel(t.name, idx);
        if (id) { matches.set(key, id); wantedIds.add(id); }
      }
      // Programmes for channels matched in another feed of the same country stay wanted too.
      for (const p of existing ?? []) if (p.feed === code && p.epg_id && !p.disabled) wantedIds.add(p.epg_id);
    };
    const from = nowMs - KEEP_BEFORE_MS, to = nowMs + KEEP_AHEAD_MS;
    const reader = new XmltvReader();
    const stream = res.body.pipeThrough(new DecompressionStream("gzip")).pipeThrough(new TextDecoderStream());
    for await (const chunk of stream as unknown as AsyncIterable<string>) {
      reader.push(chunk, (c) => channels.push(c), (p) => {
        if (!wantedIds) decide();
        if (!wantedIds?.has(p.channel) || !(p.stop > from && p.start < to) || !(p.stop > p.start)) return;
        if (progs.length >= 80000) throw new Error("Guide record limit exceeded; previous listings retained");
        progs.push({ feed: code, epg_id: p.channel, start_at: new Date(p.start).toISOString(), stop_at: new Date(p.stop).toISOString(), title: p.title.slice(0, 300) || "Programme", descr: p.desc.slice(0, 1000) });
      }, (channel) => { if (!wantedIds) decide(); return wantedIds?.has(channel) ?? false; });
    }
    if (!wantedIds) decide();
    // Stage a complete generation; publish it in one transaction only after every write succeeds.
    const seen = new Set<string>();
    const unique = progs.filter((p) => { const k = p.epg_id + p.start_at; if (seen.has(k)) return false; seen.add(k); return true; });
    if (!unique.length) throw new Error('Empty guide; previous programmes retained');
    const stage = async (kind: string, rows: unknown[]) => {
      for (let i = 0; i < rows.length; i += 1000) {
        const { error } = await db.from('epg_import_batches').insert({ run_id: run, kind, part: i / 1000, payload: rows.slice(i, i + 1000) as Json });
        if (error) throw new Error(error.message);
      }
    };
    await stage('programmes', unique);
    const nameOf = new Map(channels.map((c) => [c.id, c.names[0] ?? c.id]));
    const chRows = channels.map((c) => ({ feed: code, epg_id: c.id, name: (c.names[0] ?? c.id).slice(0, 200) }));
    const chSeen = new Set<string>();
    const chUnique = chRows.filter((r) => !chSeen.has(r.epg_id) && chSeen.add(r.epg_id));
    await stage('channels', chUnique);
    // Automatic matches: earlier feeds in a channel's list win over later ones; manual fixes are never touched.
    const mapRows = mine.flatMap((t): TablesInsert<"epg_channel_map">[] => {
      const key = t.name.trim().toLowerCase();
      const p = prior.get(key);
      if (p?.manual) return [];
      const id = matches.get(key);
      const rank = (f: string | null | undefined) => (f ? t.feeds.indexOf(f) : 99);
      if (id) {
        if (p?.feed && p.feed !== code && p.epg_id && rank(p.feed) < rank(code)) return [];
        return [{ channel_key: key, channel_name: t.name, category: t.category, feed: code, epg_id: id, epg_name: nameOf.get(id) ?? id, updated_at: new Date().toISOString() }];
      }
      if (p && p.feed && p.feed !== code) return [];
      return [{ channel_key: key, channel_name: t.name, category: t.category, feed: null, epg_id: null, epg_name: null, updated_at: new Date().toISOString() }];
    });
    await stage('matches', mapRows);
    const { error: publishError } = await db.rpc('finish_epg_import', { p_code: code, p_run: run, p_counts: { channels: channels.length, matched: matches.size, programmes: unique.length } });
    if (publishError) throw new Error(publishError.message);
    listingCache.clear();
    return { feed: code, channels: channels.length, matched: matches.size, programmes: unique.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.rpc('fail_epg_import', { p_code: code, p_run: run, p_error: msg.slice(0, 300) });
    return { feed: code, error: msg };
  }
}

const listingCache = new Map<string, { at: number; rows: ListingRow[] | null }>();
const LISTING_TTL = 60_000;
const listingInflight = new Map<string, Promise<ListingRow[] | null>>();

async function publishedListings(key: string, from: number, to: number, nowMs: number): Promise<ListingRow[] | null> {
  const hit = listingCache.get(key);
  if (hit && nowMs - hit.at < (hit.rows ? LISTING_TTL : 60000)) return hit.rows;
  const pending = listingInflight.get(key);
  if (pending) return pending;
  const load = (async () => {
    const db = await admin();
    // One indexed channel lookup, not a paginated read of the entire map.
    const { data: m, error: mapError } = await db.from("epg_channel_map").select("feed, epg_id").eq("channel_key", key).eq("disabled", false).maybeSingle();
    if (mapError) throw new Error(mapError.message);
    let rows: ListingRow[] | null = null;
    if (m?.feed && m.epg_id) {
      const { data, error } = await db.from("epg_programmes").select("start_at, stop_at, title, descr").eq("feed", m.feed).eq("epg_id", m.epg_id)
        .gt("stop_at", new Date(from).toISOString()).lt("start_at", new Date(to).toISOString()).order("start_at").limit(120);
      if (error) throw new Error(error.message);
      rows = data?.length ? data.map((p) => toListing({ start: Date.parse(p.start_at), stop: Date.parse(p.stop_at), title: p.title, desc: p.descr })) : null;
    }
    listingCache.set(key, { at: nowMs, rows });
    if (listingCache.size > 5000) { const oldest = listingCache.keys().next().value; if (oldest !== undefined) listingCache.delete(oldest); }
    return rows;
  })().finally(() => listingInflight.delete(key));
  listingInflight.set(key, load);
  return load;
}

type SportsEvent = { title: string; start: number; end?: number; channels: string[]; competition?: string };

/**
 * Listings for one Live TV channel: Sports Guide events for event-only/Sports Pass feeds,
 * the real published guide when matched, otherwise null (apps fall back to the provider).
 */
export async function guideFor(channel: string, eventsOrLoad: SportsEvent[] | (() => Promise<SportsEvent[]>), nowMs = Date.now()): Promise<{ rows: ListingRow[] | null; source: "sports" | "real" | "none" }> {
  const key = channel.trim().toLowerCase();
  const { isEventChannel } = await import("./player-channel-health");
  const { isOfficialSportsChannel } = await import("./sports-programme-end");
  // Continuous official broadcasters never overlay event listings: don't wait
  // for a full sports build (playlist + provider EPG) to return BBC/Sky/ESPN rows.
  const official = isOfficialSportsChannel(channel);
  const { needsSportsEvents } = await import("./real-epg");
  const events = Array.isArray(eventsOrLoad) ? eventsOrLoad : needsSportsEvents(channel, official, isEventChannel(stripQualityTail(channel))) ? await eventsOrLoad() : [];
  const from = nowMs - KEEP_BEFORE_MS, to = nowMs + KEEP_AHEAD_MS;
  const onGuide = events.some((e) => e.channels.some((c) => c.trim().toLowerCase() === key));
  if (isEventChannel(stripQualityTail(channel))) return { rows: eventListings(channel, events, from, to).map(toListing), source: "sports" };
  const realRows = await publishedListings(key, from, to, nowMs);
  // Sports Pass channels that also have a published guide: the Sports Guide event wins its slot.
  if (onGuide && !isOfficialSportsChannel(channel)) {
    const evs = eventListings(channel, events, from, to).filter((e) => e.title !== "No event scheduled");
    if (!realRows) return { rows: eventListings(channel, events, from, to).map(toListing), source: "sports" };
    const base = realRows.map((r) => ({ start: r.start_timestamp * 1000, stop: r.stop_timestamp * 1000, row: r }));
    const merged = overlayEvents(base.map((b) => ({ start: b.start, stop: b.stop, title: "", row: b.row as ListingRow | null })), evs.map((e) => ({ start: e.start, stop: e.stop, title: e.title, row: toListing(e) as ListingRow | null })));
    return { rows: merged.flatMap((m) => m.row ? [m.row] : []), source: "sports" };
  }
  return realRows ? { rows: realRows, source: "real" } : { rows: null, source: "none" };
}
