import { espnJson } from "@/lib/espn-fetch";

const ESPN_STANDINGS_URL = `https://site.api.espn.com/apis/v2/sports/soccer/eng.2/standings`;
const BORO_TEAM_RE = /\bmiddles(?:brough|borough)\b|\bboro\b/i;

export type FullLeagueRow = {
  position: number;
  team: string;
  logo: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  isBoro: boolean;
};

export async function fetchFullStandings(): Promise<FullLeagueRow[]> {
  const json = (await espnJson(ESPN_STANDINGS_URL)) as null | {
    children?: Array<{
      standings?: {
        entries?: Array<{
          team?: { id?: string; displayName?: string; shortDisplayName?: string };
          stats?: Array<{ name?: string; type?: string; value?: number; displayValue?: string }>;
        }>;
      };
    }>;
  };
  const entries = json?.children?.[0]?.standings?.entries ?? [];
  if (!entries.length) return [];

  const num = (s: { value?: number; displayValue?: string } | undefined) =>
    typeof s?.value === "number" ? s.value : parseInt(s?.displayValue ?? "0", 10) || 0;

  const raw = entries.map((e) => {
    const stats = e.stats ?? [];
    const by = (t: string) => stats.find((s) => s.type === t || s.name === t);
    const name = e.team?.shortDisplayName || e.team?.displayName || "";
    return {
      rank: num(by("rank")),
      team: name,
      logo: e.team?.id
        ? `https://a.espncdn.com/i/teamlogos/soccer/500/${e.team.id}.png`
        : null,
      played: num(by("gamesplayed") ?? by("gamesPlayed")),
      won: num(by("wins")),
      drawn: num(by("ties")),
      lost: num(by("losses")),
      goalsFor: num(by("pointsfor") ?? by("pointsFor")),
      goalsAgainst: num(by("pointsagainst") ?? by("pointsAgainst")),
      goalDifference: num(by("pointdifferential") ?? by("pointDifferential")),
      points: num(by("points")),
      isBoro: BORO_TEAM_RE.test(name),
    };
  });

  const hasRanks = raw.some((r) => r.rank > 0);
  raw.sort((a, b) =>
    hasRanks
      ? (a.rank || 999) - (b.rank || 999)
      : b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        a.team.localeCompare(b.team),
  );
  return raw.map(({ rank: _r, ...r }, i) => ({ position: i + 1, ...r }));
}
