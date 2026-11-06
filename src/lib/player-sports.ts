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
  const byFixture = new Map<string, PlayerSportsEvent>();
  const fixtureName = (t: string) => t.toLowerCase().replace(/\b(vs?\.?|versus)\b/g, "v").replace(/[^a-z0-9]+/g, " ").trim();
  for (const g of guides) {
    for (const e of parseSportsListingBlock(g.body ?? "")) {
      if (!safePublicEventTitle(e)) continue;
      const start = ukListingInstant(e.date, e.time);
      if (start == null || start < nowMs - WINDOW_BACK || start > nowMs + WINDOW_AHEAD) continue;
      // One card per fixture: every guide listing the same game adds its channels to that card.
      const channels = e.channels.map((c) => c.trim()).filter(Boolean);
      const key = `${start}|${fixtureName(e.title)}`;
      const existing = byFixture.get(key);
      if (existing) {
        const have = new Set(existing.channels.map((c) => c.toLowerCase()));
        for (const c of channels) if (!have.has(c.toLowerCase()) && existing.channels.length < 30) { existing.channels.push(c); have.add(c.toLowerCase()); }
        continue;
      }
      const ev = { sport: g.parent || g.category || g.title, subcategory: g.parent ? g.category ?? "" : "", competition: g.title, title: e.title, date: e.date, time: e.time, start,
        channels: channels.slice(0, 30) };
      byFixture.set(key, ev);
      out.push(ev);
    }
  }
  return out.sort((a, b) => a.start - b.start).slice(0, 400);
}
