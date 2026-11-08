import { EPG_SOURCE, XmltvReader, buildIndex, matchChannel, feedsFor, toListing, eventListings, overlayEvents, type EpgChannel, type ListingRow } from "./real-epg";

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
    .filter((c) => !isEventChannel(c.name) && !isReplayChannel(c.name, c.category))
    .map((c) => ({ ...c, feeds: feedsFor(c.name, c.category) }))
    .filter((c) => c.feeds.length);
}

/** Picks the stalest feed the playlist needs and imports it. */
export async function importNextFeed(nowMs = Date.now()) {
  const db = await admin();
  const targets = await playlistTargets();
  const wanted = [...new Set(targets.flatMap((t) => t.feeds))];
  const { data: rows } = await db.from("epg_feeds").select("code, imported_at");
  const at = new Map((rows ?? []).map((r) => [r.code, r.imported_at ? Date.parse(r.imported_at) : 0]));
  const due = wanted.filter((f) => nowMs - (at.get(f) ?? 0) >= FEED_REFRESH_MS).sort((a, b) => (at.get(a) ?? 0) - (at.get(b) ?? 0));
  if (!due.length) return { skipped: "All guides fresh", feeds: wanted.length };
  return importFeed(due[0], targets, nowMs);
}

export async function importFeed(code: string, targets?: Awaited<ReturnType<typeof playlistTargets>>, nowMs = Date.now()) {
  const db = await admin();
  targets ??= await playlistTargets();
  const mine = targets.filter((t) => t.feeds.includes(code));
  try {
    const res = await fetch(`${EPG_SOURCE}${code}.xml.gz`, { signal: AbortSignal.timeout(50_000) });
    if (!res.ok || !res.body) throw new Error(`Guide download failed (${res.status})`);
    const channels: EpgChannel[] = [];
    let wantedIds: Set<string> | null = null;
    const matches = new Map<string, string>();
    const progs: { feed: string; epg_id: string; start_at: string; stop_at: string; title: string; descr: string }[] = [];
    const { data: existing } = await db.from("epg_channel_map").select("channel_key, feed, epg_id, manual, disabled").in("channel_key", mine.map((t) => t.name.trim().toLowerCase()));
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
        if (!wantedIds!.has(p.channel) || !(p.stop > from && p.start < to) || !(p.stop > p.start)) return;
        progs.push({ feed: code, epg_id: p.channel, start_at: new Date(p.start).toISOString(), stop_at: new Date(p.stop).toISOString(), title: p.title.slice(0, 300) || "Programme", descr: p.desc.slice(0, 1000) });
      });
    }
    if (!wantedIds) decide();
    // Replace this feed's programmes and channel list.
    await db.from("epg_programmes").delete().eq("feed", code);
    const seen = new Set<string>();
    const unique = progs.filter((p) => { const k = p.epg_id + p.start_at; if (seen.has(k)) return false; seen.add(k); return true; });
    for (let i = 0; i < unique.length; i += 1000) {
      const { error } = await db.from("epg_programmes").insert(unique.slice(i, i + 1000));
      if (error) throw new Error(error.message);
    }
    await db.from("epg_feed_channels").delete().eq("feed", code);
    const nameOf = new Map(channels.map((c) => [c.id, c.names[0] ?? c.id]));
    const chRows = channels.map((c) => ({ feed: code, epg_id: c.id, name: (c.names[0] ?? c.id).slice(0, 200) }));
    for (let i = 0; i < chRows.length; i += 1000) await db.from("epg_feed_channels").upsert(chRows.slice(i, i + 1000));
    // Automatic matches: earlier feeds in a channel's list win over later ones; manual fixes are never touched.
    const mapRows = mine.flatMap((t) => {
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
    for (let i = 0; i < mapRows.length; i += 1000) await db.from("epg_channel_map").upsert(mapRows.slice(i, i + 1000));
    await db.from("epg_feeds").upsert({ code, imported_at: new Date().toISOString(), channels: channels.length, matched: matches.size, programmes: unique.length, error: null });
    return { feed: code, channels: channels.length, matched: matches.size, programmes: unique.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Count the attempt so one broken feed doesn't block the others.
    await db.from("epg_feeds").upsert({ code, imported_at: new Date().toISOString(), error: msg.slice(0, 300) });
    return { feed: code, error: msg };
  }
}

let mapCache: { at: number; map: Map<string, { feed: string; epg_id: string }> } | null = null;
async function channelMap() {
  if (mapCache && Date.now() - mapCache.at < 10 * 60_000) return mapCache.map;
  const db = await admin();
  const map = new Map<string, { feed: string; epg_id: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("epg_channel_map").select("channel_key, feed, epg_id").not("epg_id", "is", null).eq("disabled", false).range(from, from + 999);
    if (error) break;
    for (const r of data ?? []) if (r.feed && r.epg_id) map.set(r.channel_key, { feed: r.feed, epg_id: r.epg_id });
    if (!data || data.length < 1000) break;
  }
  mapCache = { at: Date.now(), map };
  return map;
}

const listingCache = new Map<string, { at: number; rows: ListingRow[] | null }>();
const LISTING_TTL = 15 * 60_000;

type SportsEvent = { title: string; start: number; end?: number; channels: string[]; competition?: string };

/**
 * Listings for one Live TV channel: Sports Guide events for event-only/Sports Pass feeds,
 * the real published guide when matched, otherwise null (apps fall back to the provider).
 */
export async function guideFor(channel: string, events: SportsEvent[], nowMs = Date.now()): Promise<{ rows: ListingRow[] | null; source: "sports" | "real" | "none" }> {
  const key = channel.trim().toLowerCase();
  const { isEventChannel } = await import("./player-channel-health");
  const { isOfficialSportsChannel } = await import("./sports-programme-end");
  const from = nowMs - KEEP_BEFORE_MS, to = nowMs + KEEP_AHEAD_MS;
  const onGuide = events.some((e) => e.channels.some((c) => c.trim().toLowerCase() === key));
  if (isEventChannel(channel)) return { rows: eventListings(channel, events, from, to).map(toListing), source: "sports" };
  const hit = listingCache.get(key);
  let realRows: ListingRow[] | null = hit && nowMs - hit.at < LISTING_TTL ? hit.rows : null;
  if (!hit || nowMs - hit.at >= LISTING_TTL) {
    const m = (await channelMap()).get(key);
    if (m) {
      const db = await admin();
      const { data } = await db.from("epg_programmes").select("start_at, stop_at, title, descr").eq("feed", m.feed).eq("epg_id", m.epg_id)
        .gt("stop_at", new Date(from).toISOString()).lt("start_at", new Date(to).toISOString()).order("start_at").limit(120);
      const progs = (data ?? []).map((p) => ({ start: Date.parse(p.start_at), stop: Date.parse(p.stop_at), title: p.title, desc: p.descr }));
      realRows = progs.length ? progs.map(toListing) : null;
    }
    listingCache.set(key, { at: nowMs, rows: realRows });
    if (listingCache.size > 5000) listingCache.delete(listingCache.keys().next().value!);
  }
  // Sports Pass channels that also have a published guide: the Sports Guide event wins its slot.
  if (onGuide && !isOfficialSportsChannel(channel)) {
    const evs = eventListings(channel, events, from, to).filter((e) => e.title !== "No event scheduled");
    if (!realRows) return { rows: eventListings(channel, events, from, to).map(toListing), source: "sports" };
    const base = realRows.map((r) => ({ start: r.start_timestamp * 1000, stop: r.stop_timestamp * 1000, row: r }));
    const merged = overlayEvents(base.map((b) => ({ start: b.start, stop: b.stop, title: "", row: b.row as ListingRow | null })), evs.map((e) => ({ start: e.start, stop: e.stop, title: e.title, row: toListing(e) as ListingRow | null })));
    return { rows: merged.map((m) => m.row!), source: "sports" };
  }
  return realRows ? { rows: realRows, source: "real" } : { rows: null, source: "none" };
}
