// Star man ratings.
//
// Every competition we cover (league, cups, play-offs) reports the same FotMob
// match stat set, so the rating below works for any fixture. It is a 0-10
// performance rating built from the stats we already store, used to pick the
// three star players of the gameweek (3 / 2 / 1 bonus points).

/** Bonus points awarded to the 1st, 2nd and 3rd star players. */
export const STAR_BONUSES = [3, 2, 1] as const;

export const STAR_LABELS = ["Star man", "2nd star", "3rd star"] as const;

export type StarRatingStats = {
  minutes?: number | null;
  goals?: number | null;
  assists?: number | null;
  shots?: number | null;
  shots_on_target?: number | null;
  big_chances_created?: number | null;
  big_chances_missed?: number | null;
  duels_won?: number | null;
  defensive_interventions?: number | null;
  accurate_passes?: number | null;
  accurate_long_balls?: number | null;
  pass_pct?: number | null;
  touches?: number | null;
  saves?: number | null;
  pens_saved?: number | null;
  pens_missed?: number | null;
  goals_conceded?: number | null;
  crosses_claimed?: number | null;
  unclaimed_crosses?: number | null;
  keeper_sweepers?: number | null;
  fouls_committed?: number | null;
  offsides?: number | null;
  own_goals?: number | null;
  yellows?: number | null;
  reds?: number | null;
};

const n = (v: number | null | undefined) => Number(v) || 0;

/**
 * Only players with a real say in the game can win a star: 45+ minutes, or a
 * goal or assist off the bench.
 */
export function isStarEligible(s: StarRatingStats): boolean {
  return n(s.minutes) >= 45 || n(s.goals) > 0 || n(s.assists) > 0;
}

/**
 * A 0-10 match rating for one player's performance in a fixture.
 * Scaled so a quiet 90 minutes sits around 6.0.
 */
export function computeStarRating(s: StarRatingStats): number {
  const mins = n(s.minutes);
  if (mins <= 0) return 0;

  let r = 6;
  // Attacking output
  r += n(s.goals) * 1.4;
  r += n(s.assists) * 1;
  r += n(s.big_chances_created) * 0.35;
  r += n(s.shots_on_target) * 0.2;
  r += n(s.shots) * 0.06;
  r -= n(s.big_chances_missed) * 0.3;
  r -= n(s.pens_missed) * 0.8;
  // Involvement
  r += n(s.duels_won) * 0.09;
  r += n(s.defensive_interventions) * 0.09;
  r += n(s.accurate_long_balls) * 0.05;
  r += Math.min(n(s.accurate_passes), 90) * 0.012;
  r += Math.min(n(s.touches), 120) * 0.004;
  if (n(s.pass_pct) >= 85 && n(s.accurate_passes) >= 20) r += 0.25;
  // Goalkeeping
  r += n(s.saves) * 0.35;
  r += n(s.pens_saved) * 1.5;
  r += n(s.crosses_claimed) * 0.1;
  r += n(s.keeper_sweepers) * 0.08;
  r -= n(s.unclaimed_crosses) * 0.2;
  r -= n(s.goals_conceded) * 0.35;
  // Discipline / errors
  r -= n(s.fouls_committed) * 0.08;
  r -= n(s.offsides) * 0.05;
  r -= n(s.own_goals) * 1.5;
  r -= n(s.yellows) * 0.4;
  r -= n(s.reds) * 1.5;
  // Short cameos can't reach the very top marks
  if (mins < 30) r = 6 + (r - 6) * 0.7;

  return Math.round(Math.max(0, Math.min(10, r)) * 10) / 10;
}
