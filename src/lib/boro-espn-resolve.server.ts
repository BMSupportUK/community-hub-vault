// Resolve an ESPN event id straight from team names + kick-off time.
//
// The match centre used to depend on an eventId cached on the match-centre row.
// When ESPN's team-schedule feed was refused (or the worker ran out of outbound
// requests during a sync) that id stayed null and the pop-up fell back to
// "Awaiting kick-off" even though the Gamecast feed was perfectly reachable.
// This helper lets any request resolve the id on its own, with a short cache so
// repeated polls stay cheap.

const COMPETITIONS: Array<{ slug: string; match: RegExp }> = [
  { slug: "eng.2", match: /champ/i },
  { slug: "eng.league_cup", match: /carabao|league cup|efl cup/i },
  { slug: "eng.fa", match: /fa cup/i },
  { slug: "eng.trophy", match: /trophy/i },
  { slug: "club.friendly", match: /friendly/i },
];

export type ResolvedEspnEvent = { eventId: string; slug: string };

const cache = new Map<string, { at: number; value: ResolvedEspnEvent | null }>();
const TTL_MS = 5 * 60 * 1000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function slugOrder(competition?: string | null): string[] {
  const all = COMPETITIONS.map((c) => c.slug);
  if (!competition) return all;
  const preferred = COMPETITIONS.find((c) => c.match.test(competition))?.slug;
  return preferred ? [preferred, ...all.filter((s) => s !== preferred)] : all;
}

export async function resolveEspnEvent(input: {
  home: string;
  away: string;
  kickoff: string;
  competition?: string | null;
}): Promise<ResolvedEspnEvent | null> {
  const ko = Date.parse(input.kickoff);
  if (!Number.isFinite(ko)) return null;

  const key = `${norm(input.home)}|${norm(input.away)}|${Math.round(ko / 60000)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const { espnJson, espnDateRange } = await import("@/lib/espn-fetch");
  const dates = espnDateRange(ko - 86_400_000, ko + 86_400_000);
  const wanted = [norm(input.home), norm(input.away)];

  let best: { value: ResolvedEspnEvent; distance: number } | null = null;
  const orderedSlugs = slugOrder(input.competition);
  const preferredSlug = COMPETITIONS.find((competition) => competition.match.test(input.competition ?? ""))?.slug;
  // A recognised competition has one authoritative feed. Avoid waiting for
  // four unrelated competitions when its scoreboard is temporarily blocked.
  const slugs = preferredSlug ? [preferredSlug] : orderedSlugs;
  for (const slug of slugs) {
    const json = (await espnJson(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dates}&limit=400`,
    )) as { events?: any[] } | null;
    if (!json) continue;
    for (const ev of json.events ?? []) {
      const competitors: any[] = ev?.competitions?.[0]?.competitors ?? [];
      const names = competitors.map((c) => norm(String(c?.team?.displayName ?? "")));
      const hitBoth = wanted.every((w) => names.some((n) => n.includes(w) || w.includes(n)));
      if (!hitBoth || !ev?.id) continue;
      const distance = Math.abs(Date.parse(ev.date) - ko);
      if (!Number.isFinite(distance) || distance > 2 * 86_400_000) continue;
      const value = { eventId: String(ev.id), slug };
      if (!best || distance < best.distance) best = { value, distance };
    }
  }

  if (best) {
    cache.set(key, { at: Date.now(), value: best.value });
    return best.value;
  }

  // Do not hold a negative lookup near kick-off: providers can publish an
  // event or recover from a temporary refusal between consecutive polls.
  if (Math.abs(ko - Date.now()) > 6 * 60 * 60 * 1000) {
    cache.set(key, { at: Date.now(), value: null });
  }
  return null;
}
