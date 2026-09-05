// Automated star player awards.
//
// There is no reliable public "man of the match" feed for the competitions we
// cover, so the three star players are derived from the FotMob match stats we
// already store: each Boro player who featured gets a 0-10 performance rating
// and the top three earn 3 / 2 / 1 bonus points. Owners can still override the
// top pick on the owner screen, and an existing award is never overwritten.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { STAR_BONUSES, computeStarRating, isStarEligible, type StarRatingStats } from "@/lib/fantasy-star-rating";

/** Points added to the top star player's score (kept for existing callers). */
export const MOTM_BONUS = STAR_BONUSES[0];

const STAT_COLUMNS =
  "id, player_id, points, bonus, minutes, goals, assists, shots, shots_on_target, big_chances_created, big_chances_missed, duels_won, defensive_interventions, accurate_passes, accurate_long_balls, pass_pct, touches, saves, pens_saved, pens_missed, goals_conceded, crosses_claimed, unclaimed_crosses, keeper_sweepers, fouls_committed, offsides, own_goals, yellows, reds";

type Row = StarRatingStats & {
  id: string;
  player_id: string;
  points: number | null;
  bonus: number | null;
};

/**
 * Award the three star players for a finished fixture from the stored match
 * stats. No-op when stats are missing or an award already exists.
 */
export async function autoAwardStars(
  fixtureId: string,
  gameweekId: string,
): Promise<{ awarded: boolean; playerIds?: string[]; reason?: string }> {
  const { data, error } = await supabaseAdmin
    .from("fantasy_player_stats")
    .select(STAT_COLUMNS)
    .eq("fixture_id", fixtureId);
  if (error) return { awarded: false, reason: error.message };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => (r.minutes ?? 0) > 0);
  if (!rows.length) return { awarded: false, reason: "no stats yet" };
  if (rows.some((r) => (r.bonus ?? 0) > 0)) return { awarded: false, reason: "already awarded" };

  const ranked = rows
    .filter((r) => isStarEligible(r))
    .map((r) => ({ row: r, rating: computeStarRating(r), base: (r.points ?? 0) - (r.bonus ?? 0) }))
    .sort((a, b) => b.rating - a.rating || b.base - a.base || (b.row.minutes ?? 0) - (a.row.minutes ?? 0))
    .slice(0, STAR_BONUSES.length);

  const playerIds: string[] = [];
  for (let i = 0; i < ranked.length; i += 1) {
    const entry = ranked[i]!;
    const { error: upErr } = await supabaseAdmin
      .from("fantasy_player_stats")
      .update({ bonus: STAR_BONUSES[i] } as never)
      .eq("id", entry.row.id);
    if (upErr) return { awarded: playerIds.length > 0, playerIds, reason: upErr.message };
    playerIds.push(entry.row.player_id);
  }

  const { error: scoreErr } = await supabaseAdmin.rpc("fantasy_score_gameweek" as never, {
    _gameweek_id: gameweekId,
  } as never);
  if (scoreErr) return { awarded: true, playerIds, reason: scoreErr.message };

  await supabaseAdmin
    .from("fantasy_gameweeks")
    .update({ status: "final" } as never)
    .eq("id", gameweekId);

  return { awarded: true, playerIds };
}

/** Backwards-compatible alias. */
export const autoAwardMotm = autoAwardStars;
