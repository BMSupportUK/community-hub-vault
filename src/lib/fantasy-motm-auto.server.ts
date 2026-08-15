// Automated man-of-the-match sourcing.
//
// There is no reliable public "man of the match" feed for Championship games,
// so the award is derived from the ESPN match stats we already store: the Boro
// player with the best fantasy score for that fixture wins it. Admins can still
// override the pick on the admin screen, and a manual pick is never overwritten.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Points added to the winner's score. */
export const MOTM_BONUS = 3;

type Row = {
  id: string;
  player_id: string;
  points: number | null;
  bonus: number | null;
  goals: number | null;
  assists: number | null;
  saves: number | null;
  minutes: number | null;
};

/**
 * Award man of the match for a finished fixture from the stored match stats.
 * No-op when stats are missing or a winner (manual or automatic) already exists.
 */
export async function autoAwardMotm(
  fixtureId: string,
  gameweekId: string,
): Promise<{ awarded: boolean; playerId?: string; reason?: string }> {
  const { data, error } = await supabaseAdmin
    .from("fantasy_player_stats")
    .select("id, player_id, points, bonus, goals, assists, saves, minutes")
    .eq("fixture_id", fixtureId);
  if (error) return { awarded: false, reason: error.message };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => (r.minutes ?? 0) > 0);
  if (!rows.length) return { awarded: false, reason: "no stats yet" };
  if (rows.some((r) => (r.bonus ?? 0) > 0)) return { awarded: false, reason: "already awarded" };

  const score = (r: Row) => [
    (r.points ?? 0) - (r.bonus ?? 0),
    r.goals ?? 0,
    r.assists ?? 0,
    r.saves ?? 0,
    r.minutes ?? 0,
  ];
  const winner = rows.reduce((best, r) => {
    const a = score(r);
    const b = score(best);
    for (let i = 0; i < a.length; i += 1) {
      if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0) ? r : best;
    }
    return best;
  });

  const { error: upErr } = await supabaseAdmin
    .from("fantasy_player_stats")
    .update({ bonus: MOTM_BONUS } as never)
    .eq("id", winner.id);
  if (upErr) return { awarded: false, reason: upErr.message };

  const { error: scoreErr } = await supabaseAdmin.rpc("fantasy_score_gameweek" as never, {
    _gameweek_id: gameweekId,
  } as never);
  if (scoreErr) return { awarded: true, playerId: winner.player_id, reason: scoreErr.message };

  await supabaseAdmin
    .from("fantasy_gameweeks")
    .update({ status: "final" } as never)
    .eq("id", gameweekId);

  return { awarded: true, playerId: winner.player_id };
}
