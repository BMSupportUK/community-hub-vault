import type { PlayerSportsEvent } from "@/lib/player-sports";
import { isOfficialSportsChannel } from "./sports-programme-end";

/** Builds the Sports Guide feed the BM Player apps receive (server-only, uses the admin client). */
export async function buildSportsFeed() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: blogs }, { data: cats }, { data: st }] = await Promise.all([
    supabaseAdmin.from("sports_blogs").select("title, body, category_id, updated_at, sort_order, created_at, channel_links").eq("published", true).order("sort_order").order("created_at", { ascending: false }),
    supabaseAdmin.from("sports_categories").select("id, name, parent_id, sort_order").order("sort_order"),
    supabaseAdmin.from("player_settings").select("channel_aliases").eq("id", 1).maybeSingle(),
  ]);
  const { playerSportsEvents, applyGuideEnds } = await import("@/lib/player-sports");
  const { readChannelLinks } = await import("@/lib/sports-channel-links");
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
  const parentOf = new Map((cats ?? []).map((c) => [c.id, c.parent_id]));
  const guideRows = (blogs ?? []).map((b) => {
    const pid = b.category_id ? parentOf.get(b.category_id) : null;
    return { title: b.title, body: b.body, category: b.category_id ? catName.get(b.category_id) ?? null : null, parent: pid ? catName.get(pid) ?? null : null, links: readChannelLinks(b.channel_links) };
  });
  const playlistCats = [...new Set(guideRows.map((g) => g.links.category).filter((c): c is string => !!c))];
  const { playlistCategoryChannels, playlistGuideTimes, playlistAllChannels } = await import("@/lib/playlist-source.server");
  const { pinLiveChannels, isReplayChannel } = await import("@/lib/sports-live-only");
  const aliasRows = Array.isArray(st?.channel_aliases) ? (st.channel_aliases as { from: string; to: string }[]) : [];
  const live = await playlistAllChannels().then((all) => all.filter((c) => !isReplayChannel(c.name, c.category)).map((c) => c.name)).catch(() => [] as string[]);
  const rawEvents = playerSportsEvents(guideRows, Date.now(), await playlistCategoryChannels(playlistCats)).map((e) => {
    if (!live.length) return e;
    const channels = pinLiveChannels(e.channels, live, aliasRows);
    const pass = (e.passChannels ?? []).map((c) => pinLiveChannels([c], live, aliasRows)[0]).filter((c): c is string => !!c && channels.includes(c));
    return { ...e, channels, passChannels: pass };
  });
  // Real end times from the TV guide for games that have started (estimate stays when a channel has no guide).
  const nowMs = Date.now();
  const startedChannels = rawEvents.filter((e) => e.start <= nowMs).flatMap((e) => e.channels.filter(isOfficialSportsChannel));
  const events: PlayerSportsEvent[] = applyGuideEnds(rawEvents, await playlistGuideTimes(startedChannels), nowMs);
  const version = (blogs ?? []).reduce((m, b) => (b.updated_at > m ? b.updated_at : m), "") + ":" + events.map(e => `${e.start}:${e.end}:${e.endSource}`).join(",");
  // Guides follow the website order too (sort_order, newest first), after the category names.
  const order = Array.from(new Set([...(cats ?? []).map((c) => c.name), ...(blogs ?? []).map((b) => b.title)]));
  // Category pop-up: the website's own main categories, each with its sub-categories, in site order.
  const categories = (cats ?? []).filter((c) => !c.parent_id).map((c) => ({ name: c.name, subs: (cats ?? []).filter((x) => x.parent_id === c.id).map((x) => x.name) }));
  // Third level: each category's guides (website order), keyed "Main|Sub" ("Main|" when no sub-category).
  const guides: Record<string, string[]> = {};
  for (const b of blogs ?? []) {
    const c = (cats ?? []).find((x) => x.id === b.category_id); if (!c) continue;
    const parent = c.parent_id ? (cats ?? []).find((x) => x.id === c.parent_id) : null;
    const key = parent ? `${parent.name}|${c.name}` : `${c.name}|`;
    (guides[key] ??= []).includes(b.title) || guides[key].push(b.title);
  }
  return { version, events, order, categories, guides, aliases: Array.isArray(st?.channel_aliases) ? st.channel_aliases : [] };
}

type CrossData = { rows: import("@/lib/player-channel-health").HealthRow[]; stalls: { name: string; at: number }[]; at: number };
let crossCache: { at: number; list: string[]; data: CrossData } | null = null;
/** Recent health rows and stalls (cached 30 s per server instance), for per-event crosses. */
export async function currentCrossData(): Promise<CrossData> {
  await currentCrossedChannels();
  return crossCache!.data;
}
/** Channels currently marked not working (cached 30 s per server instance). */
export async function currentCrossedChannels(): Promise<string[]> {
  if (crossCache && Date.now() - crossCache.at < 30_000) return crossCache.list;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { crossedChannels, PROBLEM_WINDOW_MS, STALL_WINDOW_MS } = await import("@/lib/player-channel-health");
  const now = Date.now();
  const [{ data: rows }, { data: stalls }] = await Promise.all([
    supabaseAdmin.from("player_channel_health").select("channel_key, channel_name, last_problem_at, last_ok_at")
      .gte("last_problem_at", new Date(now - PROBLEM_WINDOW_MS).toISOString()).limit(500),
    supabaseAdmin.from("player_buffer_events").select("content_name, occurred_at").eq("kind", "live")
      .gte("occurred_at", new Date(now - STALL_WINDOW_MS).toISOString()).limit(2000),
  ]);
  // Stalls need the clean-play time of that channel too, so fetch health rows for stalling channels.
  const stallNames = [...new Set((stalls ?? []).map((s) => s.content_name.trim().toLowerCase()).filter(Boolean))];
  const known = new Set((rows ?? []).map((r) => r.channel_key));
  const missing = stallNames.filter((k) => !known.has(k));
  const { data: extra } = missing.length
    ? await supabaseAdmin.from("player_channel_health").select("channel_key, channel_name, last_problem_at, last_ok_at").in("channel_key", missing.slice(0, 300))
    : { data: [] };
  const allRows = [...(rows ?? []), ...(extra ?? [])];
  const stallList = (stalls ?? []).map((s) => ({ name: s.content_name, at: Date.parse(s.occurred_at) }));
  const list = crossedChannels(allRows, stallList, now);
  crossCache = { at: now, list, data: { rows: allRows, stalls: stallList, at: now } };
  return list;
}
