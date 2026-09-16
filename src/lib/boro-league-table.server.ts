// Full Championship table, read from FotMob (the app's only match data source).

import { fotmobTeamData, fotmobTeamLogo } from "@/lib/fotmob-fetch";

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

const int = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/** FotMob writes goals as "20-9". */
function goals(scoresStr: unknown): { for: number; against: number } {
  const [scored, conceded] = String(scoresStr ?? "")
    .split("-")
    .map((part) => int(part.trim()));
  return { for: scored ?? 0, against: conceded ?? 0 };
}

export async function fetchFullStandings(): Promise<FullLeagueRow[]> {
  const data = await fotmobTeamData(2 * 60_000);
  const table = data?.table?.[0]?.data?.table;
  const entries: any[] = Array.isArray(table?.all) ? table.all : Array.isArray(table) ? table : [];
  if (!entries.length) return [];

  const raw = entries.map((entry, index) => {
    const name = String(entry?.shortName ?? entry?.name ?? "");
    const g = goals(entry?.scoresStr);
    return {
      rank: int(entry?.idx) || index + 1,
      team: name,
      logo: fotmobTeamLogo(entry?.id),
      played: int(entry?.played),
      won: int(entry?.wins),
      drawn: int(entry?.draws),
      lost: int(entry?.losses),
      goalsFor: g.for,
      goalsAgainst: g.against,
      goalDifference: int(entry?.goalConDiff),
      points: int(entry?.pts),
      isBoro: BORO_TEAM_RE.test(name),
    };
  });

  raw.sort((a, b) => (a.rank || 999) - (b.rank || 999));
  return raw.map(({ rank: _rank, ...row }, index) => ({ position: index + 1, ...row }));
}
