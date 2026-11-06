import { parseSportsListingBlock } from "./sports-listing-format";
import { safePublicEventTitle } from "./public-guide-safety";
import { ukListingInstant } from "./import-time";

export type PlayerSportsEvent = { sport: string; subcategory: string; competition: string; title: string; date: string | null; time: string; start: number; channels: string[] };

const WINDOW_BACK = 6 * 3600_000, WINDOW_AHEAD = 7 * 86400_000;

/** Turn published guides into a validated event list for BM Player. */
export function playerSportsEvents(
  guides: { title: string; body: string | null; category: string | null; parent?: string | null }[],
  nowMs = Date.now(),
): PlayerSportsEvent[] {
  const out: PlayerSportsEvent[] = [];
  const seen = new Set<string>();
  for (const g of guides) {
    for (const e of parseSportsListingBlock(g.body ?? "")) {
      if (!safePublicEventTitle(e)) continue;
      const start = ukListingInstant(e.date, e.time);
      if (start == null || start < nowMs - WINDOW_BACK || start > nowMs + WINDOW_AHEAD) continue;
      // Separate guides can list the same fixture with different channels; keep each guide's copy.
      const key = `${g.title.toLowerCase()}|${start}|${e.title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ sport: g.parent || g.category || g.title, subcategory: g.parent ? g.category ?? "" : "", competition: g.title, title: e.title, date: e.date, time: e.time, start,
        channels: e.channels.map((c) => c.trim()).filter(Boolean).slice(0, 12) });
    }
  }
  return out.sort((a, b) => a.start - b.start).slice(0, 400);
}
