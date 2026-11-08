/**
 * Server-only: reads Live TV categories and channel names from the provider
 * using the admin-saved playlist login (PLAYLIST_USERNAME / PLAYLIST_PASSWORD)
 * and the DNS in player_settings. Never returns the login itself.
 */
type Cat = { category_id: string; category_name: string };
type Stream = { name: string; category_id: string; stream_id?: string };
import type { SportsProgramme } from "./sports-programme-end";
import { createSharedCache } from "./player-sports-cache";

type Catalogue = { at: number; cats: Cat[]; streams: Stream[] };
let cache: Catalogue | null = null;
const TTL = 10 * 60_000;
const sharedCatalogue = createSharedCache<Catalogue>(TTL);

async function base(): Promise<string | null> {
  const user = process.env.PLAYLIST_USERNAME, pass = process.env.PLAYLIST_PASSWORD;
  if (!user || !pass) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("player_settings").select("dns").eq("id", 1).maybeSingle();
  const { normaliseDns } = await import("@/lib/player-link");
  const dns = normaliseDns(data?.dns ?? "");
  if (!dns) return null;
  return `${dns}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
}

/** Metadata-only catalogue reads; never expose URLs containing playlist credentials. */
export async function playlistWatchRead(action: 'get_vod_categories' | 'get_series_categories' | 'get_vod_streams' | 'get_series' | 'get_vod_info', params: Record<string, string> = {}) {
  const url = await base();
  if (!url) throw new Error('Playlist unavailable');
  const query = new URLSearchParams({ action, ...params });
  const response = await fetch(`${url}&${query}`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('Playlist unavailable');
  return response.json();
}

async function load() {
  return sharedCatalogue(loadCatalogue);
}

async function loadCatalogue() {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const url = await base();
  if (!url) throw new Error("No playlist login or DNS saved.");
  const [c, s] = await Promise.all([
    fetch(`${url}&action=get_live_categories`, { signal: AbortSignal.timeout(15000) }).then((r) => { if (!r.ok) throw new Error("Playlist unavailable"); return r.json(); }),
    fetch(`${url}&action=get_live_streams`, { signal: AbortSignal.timeout(30000) }).then((r) => { if (!r.ok) throw new Error("Playlist unavailable"); return r.json(); }),
  ]);
  if (!Array.isArray(c) || !Array.isArray(s)) throw new Error("The playlist did not answer.");
  cache = {
    at: Date.now(),
    cats: c.map((x: Cat) => ({ category_id: String(x.category_id), category_name: String(x.category_name ?? "").trim() })),
    streams: s.map((x: Stream) => ({ name: String(x.name ?? "").trim(), category_id: String(x.category_id), stream_id: String(x.stream_id ?? "") })),
  };
  return cache;
}

export async function playlistCategoryNames(): Promise<string[]> {
  return (await load()).cats.map((c) => c.category_name).filter(Boolean);
}

/** Channel names in each requested category (by exact category name). Empty map if the playlist can't be read. */
export async function playlistCategoryChannels(names: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!names.length) return out;
  try {
    const { cats, streams } = await load();
    for (const n of names) {
      const ids = new Set(cats.filter((c) => c.category_name.toLowerCase() === n.toLowerCase()).map((c) => c.category_id));
      out.set(n.toLowerCase(), streams.filter((s) => ids.has(s.category_id)).map((s) => s.name));
    }
  } catch { /* guide still goes out with its own channel names */ }
  return out;
}

/** Every live channel with its category name, in playlist order. */
export async function playlistAllChannels(): Promise<{ name: string; category: string }[]> {
  const { cats, streams } = await load();
  const byId = new Map(cats.map((c) => [c.category_id, c.category_name]));
  return streams.filter((s) => s.name).map((s) => ({ name: s.name, category: byId.get(s.category_id) ?? "Other" }));
}

/** Stream IDs for the named channels (exact playlist names, case-insensitive). */
export async function playlistStreamIds(names: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const { streams } = await load();
    const byName = new Map(streams.map((s) => [s.name.toLowerCase(), s.stream_id ?? ""]));
    for (const n of names) { const id = byName.get(n.toLowerCase()); if (id) out.set(n.toLowerCase(), id); }
  } catch { /* nothing to check */ }
  return out;
}

/** Stream address on the separate channel-check login, or null when that login isn't saved. */
export async function channelCheckUrl(streamId: string): Promise<string | null> {
  const user = process.env.CHANNEL_CHECK_USERNAME, pass = process.env.CHANNEL_CHECK_PASSWORD;
  if (!user || !pass) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("player_settings").select("dns").eq("id", 1).maybeSingle();
  const { normaliseDns } = await import("@/lib/player-link");
  const dns = normaliseDns(data?.dns ?? "");
  return dns ? `${dns}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${encodeURIComponent(streamId)}.ts` : null;
}

const epgCache = new Map<string, { at: number; list: SportsProgramme[] }>();
/** TV-guide programme times for the named channels (exact playlist names), at most `limit` lookups. Missing data is skipped. */
export async function playlistGuideTimes(names: string[], limit = 25): Promise<Map<string, SportsProgramme[]>> {
  const out = new Map<string, SportsProgramme[]>();
  try {
    const url = await base();
    if (!url) return out;
    const { streams } = await load();
    const byName = new Map(streams.map((s) => [s.name.toLowerCase(), s.stream_id]));
    const wanted = [...new Set(names.map((n) => n.toLowerCase()))].filter((n) => byName.get(n)).slice(0, limit);
    await Promise.all(wanted.map(async (n) => {
      const hit = epgCache.get(n);
      if (hit && Date.now() - hit.at < 2 * 60_000) { out.set(n, hit.list); return; }
      try {
        const id = byName.get(n);
        if (!id) return;
        const r = await fetch(`${url}&action=get_simple_data_table&stream_id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return;
        const j = await r.json();
        const list = (Array.isArray(j?.epg_listings) ? j.epg_listings : [])
          .map((p: { title?: string; start_timestamp?: string | number; stop_timestamp?: string | number; end_timestamp?: string | number }) => {
            const raw = String(p.title ?? ""); let title = raw;
            try { if (/^[A-Za-z0-9+/]+={0,2}$/.test(raw) && raw.length % 4 === 0) title = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(raw), c => c.charCodeAt(0))); } catch { /* provider may send plain text */ }
            return { title, start: Number(p.start_timestamp) * 1000, end: Number(p.stop_timestamp ?? p.end_timestamp) * 1000 };
          })
          .filter((p: SportsProgramme) => p.start > 0 && p.end > p.start && p.end - p.start <= 12 * 3600_000 && p.end > Date.now() - 12 * 3600_000);
        epgCache.set(n, { at: Date.now(), list });
        out.set(n, list);
      } catch { /* no guide for this channel */ }
    }));
  } catch { /* estimates stay */ }
  return out;
}
