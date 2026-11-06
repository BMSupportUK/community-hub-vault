/**
 * Server-only: reads Live TV categories and channel names from the provider
 * using the admin-saved playlist login (PLAYLIST_USERNAME / PLAYLIST_PASSWORD)
 * and the DNS in player_settings. Never returns the login itself.
 */
type Cat = { category_id: string; category_name: string };
type Stream = { name: string; category_id: string };

let cache: { at: number; cats: Cat[]; streams: Stream[] } | null = null;
const TTL = 10 * 60_000;

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

async function load() {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const url = await base();
  if (!url) throw new Error("No playlist login or DNS saved.");
  const [c, s] = await Promise.all([
    fetch(`${url}&action=get_live_categories`, { signal: AbortSignal.timeout(15000) }).then((r) => r.json()),
    fetch(`${url}&action=get_live_streams`, { signal: AbortSignal.timeout(30000) }).then((r) => r.json()),
  ]);
  if (!Array.isArray(c) || !Array.isArray(s)) throw new Error("The playlist did not answer.");
  cache = {
    at: Date.now(),
    cats: c.map((x: Cat) => ({ category_id: String(x.category_id), category_name: String(x.category_name ?? "").trim() })),
    streams: s.map((x: Stream) => ({ name: String(x.name ?? "").trim(), category_id: String(x.category_id) })),
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
