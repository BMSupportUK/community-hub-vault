// Server-only: build a per-match stat + points breakdown for one fantasy player.
import type { FantasyPlayerBreakdown, FantasyPlayerMatchStats } from "@/lib/fantasy.functions";

const STAT_COLUMNS: Array<[string, string]> = [
  ["minutes", "minutes"],
  ["goals", "goals"],
  ["assists", "assists"],
  ["shots", "shots"],
  ["shots_on_target", "shots_on_target"],
  ["shots_faced", "shots_faced"],
  ["shots_on_goal_against", "shots_on_goal_against"],
  ["saves", "saves"],
  ["pens_saved", "pens_saved"],
  ["pens_missed", "pens_missed"],
  ["goals_conceded", "goals_conceded"],
  ["passes", "passes"],
  ["accurate_passes", "accurate_passes"],
  ["accurate_long_balls", "accurate_long_balls"],
  ["big_chances_created", "big_chances_created"],
  ["big_chances_missed", "big_chances_missed"],
  ["touches", "touches"],
  ["duels_won", "duels_won"],
  ["defensive_interventions", "defensive_interventions"],
  ["crosses_claimed", "crosses_claimed"],
  ["unclaimed_crosses", "unclaimed_crosses"],
  ["keeper_sweepers", "keeper_sweepers"],
  ["fouls_committed", "fouls_committed"],
  ["fouls_suffered", "fouls_suffered"],
  ["offsides", "offsides"],
  ["yellows", "yellows"],
  ["reds", "reds"],
  ["own_goals", "own_goals"],
  ["bonus", "bonus"],
];

const BORO = /middles(?:brough|borough)|\bboro\b/i;

export async function buildPlayerBreakdown(
  admin: any,
  playerId: string,
): Promise<FantasyPlayerBreakdown> {
  const { data: player, error: pErr } = await admin
    .from("fantasy_players")
    .select("name, position, alt_position, shirt_number")
    .eq("id", playerId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);

  const { data: rows, error } = await admin
    .from("fantasy_player_stats")
    .select("*")
    .eq("player_id", playerId);
  if (error) throw new Error(error.message);

  const fixtureIds = Array.from(new Set((rows ?? []).map((r: any) => r.fixture_id))).filter(Boolean);
  const fixtures = new Map<string, any>();
  const gwByFixture = new Map<string, number>();
  if (fixtureIds.length > 0) {
    const { data: fx } = await admin
      .from("boro_fixtures")
      .select("id, home_team, away_team, kickoff_at, home_score, away_score")
      .in("id", fixtureIds as string[]);
    for (const f of fx ?? []) fixtures.set(f.id, f);
    const { data: gws } = await admin
      .from("fantasy_gameweeks")
      .select("fixture_id, gw_number")
      .in("fixture_id", fixtureIds as string[]);
    for (const g of gws ?? []) gwByFixture.set(g.fixture_id, g.gw_number);
  }

  const matches: FantasyPlayerMatchStats[] = (rows ?? []).map((r: any) => {
    const f = fixtures.get(r.fixture_id);
    const opponent = f ? (BORO.test(f.home_team ?? "") ? `${f.away_team} (A)` : `${f.home_team} (H)`) : "Fixture";
    const stats: Record<string, number> = {};
    for (const [key, col] of STAT_COLUMNS) stats[key] = Number(r[col] ?? 0) || 0;
    return {
      fixtureId: r.fixture_id,
      gwNumber: gwByFixture.get(r.fixture_id) ?? null,
      label: opponent,
      kickoffAt: f?.kickoff_at ?? null,
      points: Number(r.points ?? 0) || 0,
      stats,
    };
  });

  matches.sort((a, b) => Date.parse(b.kickoffAt ?? "0") - Date.parse(a.kickoffAt ?? "0"));

  return {
    name: player?.name ?? "Player",
    position: player?.position ?? "",
    altPosition: player?.alt_position ?? null,
    shirtNumber: player?.shirt_number ?? null,
    totalPoints: matches.reduce((s, m) => s + m.points, 0),
    matches,
  };
}

export const FANTASY_STAT_ORDER = STAT_COLUMNS.map(([k]) => k);
