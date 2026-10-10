import { fetchFotmobSummary } from "@/lib/fotmob-boro.server";
import { makePlayerMatcher } from "@/lib/fantasy-live-stats.server";

type Fixture = { homeTeam: string; awayTeam: string; kickoffAt: string };
type Player = { id: string; name: string; position: string };
const cache = new Map<string, { at: number; result: Promise<Set<string> | null> }>();

/** Read both the real XI and bench without changing picks or scoring. */
export function readFantasyMatchdaySquad(fixture: Fixture, players: Player[]) {
  const key = `${fixture.kickoffAt}:${fixture.homeTeam}:${fixture.awayTeam}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 300_000) return hit.result;
  const result = (async () => {
    try {
      const summary = await fetchFotmobSummary({
        home: fixture.homeTeam, away: fixture.awayTeam, kickoff: fixture.kickoffAt,
      });
      if (summary?._lineupsConfirmed !== true) return null;
      const side = (summary.rosters ?? []).find((r: any) => /middles(?:brough|borough)|\bboro\b/i.test(r.team?.displayName ?? ""));
      const roster = (side?.roster ?? []) as Array<{ starter?: boolean; athlete?: { displayName?: string } }>;
      if (roster.filter((p) => p.starter).length !== 11 || !roster.some((p) => !p.starter)) return null;
      const match = makePlayerMatcher(players);
      const ids = roster.map((p) => match(p.athlete?.displayName ?? "")?.id);
      // An unmapped name could be the selected player: never guess absence.
      if (ids.some((id) => !id)) return null;
      return new Set(ids.filter((id): id is string => !!id));
    } catch { return null; }
  })();
  cache.set(key, { at: Date.now(), result });
  return result;
}