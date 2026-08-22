/**
 * Automatic line-up swaps.
 *
 * Once Middlesbrough's official starting eleven is announced, any bench player
 * in a manager's squad who IS starting is swapped into the eleven in place of a
 * picked starter who is NOT starting. The swap has to be like for like: the
 * incoming player must be able to play the slot's position (his listed position
 * or his second position for dual-position players). Every swap is noted on
 * both picks so managers can see exactly what happened and why.
 */

type Admin = { from: (table: string) => any; rpc?: unknown };

type PlayerRow = { id: string; name: string; position: string; alt_position: string | null };
type PickRow = {
  id: string;
  player_id: string;
  is_starter: boolean;
  slot_order: number;
  picked_position: string | null;
};

export type LineupSwapResult = {
  ok: boolean;
  gameweek?: number;
  squadsChanged: number;
  swaps: string[];
  skipped: string[];
  error?: string;
};

/** Positions a player can legitimately be scored in. */
function eligible(p: PlayerRow): string[] {
  const out = [p.position];
  if (p.alt_position && p.alt_position !== p.position) out.push(p.alt_position);
  return out;
}

function slotPosition(pick: PickRow, player: PlayerRow): string {
  return pick.picked_position ?? player.position;
}

/**
 * Swap bench starters in for picked starters who were left out, for every squad
 * in one gameweek. Safe to run repeatedly — once a squad matches the official
 * eleven there is nothing left to swap.
 */
export async function applyLineupSwapsForGameweek(
  admin: Admin,
  gameweek: { id: string; gw_number: number },
  starterIds: string[],
  players: PlayerRow[],
): Promise<LineupSwapResult> {
  const byId = new Map(players.map((p) => [p.id, p]));
  const official = new Set(starterIds);
  const swaps: string[] = [];
  const skipped: string[] = [];
  let squadsChanged = 0;

  const { data: squads, error } = await admin
    .from("fantasy_squads")
    .select("id, gameweek_id")
    .eq("gameweek_id", gameweek.id);
  if (error) return { ok: false, squadsChanged: 0, swaps, skipped, error: error.message };

  const nowIso = new Date().toISOString();

  for (const squad of (squads ?? []) as Array<{ id: string }>) {
    const { data: pickRows, error: pErr } = await admin
      .from("fantasy_squad_picks")
      .select("id, player_id, is_starter, slot_order, picked_position")
      .eq("squad_id", squad.id);
    if (pErr) {
      skipped.push(`squad ${squad.id}: ${pErr.message}`);
      continue;
    }
    const picks = (pickRows ?? []) as PickRow[];

    const outs = picks
      .filter((p) => p.is_starter && !official.has(p.player_id))
      .sort((a, b) => a.slot_order - b.slot_order);
    const ins = picks
      .filter((p) => !p.is_starter && official.has(p.player_id))
      .sort((a, b) => a.slot_order - b.slot_order);
    if (outs.length === 0 || ins.length === 0) continue;

    const used = new Set<string>();
    let changed = 0;

    for (const out of outs) {
      const outPlayer = byId.get(out.player_id);
      if (!outPlayer) continue;
      const wanted = slotPosition(out, outPlayer);

      const inPick = ins.find((cand) => {
        if (used.has(cand.id)) return false;
        const candPlayer = byId.get(cand.player_id);
        if (!candPlayer) return false;
        return eligible(candPlayer).includes(wanted);
      });
      if (!inPick) {
        skipped.push(`no like-for-like ${wanted.toUpperCase()} on the bench for ${outPlayer.name}`);
        continue;
      }
      used.add(inPick.id);
      const inPlayer = byId.get(inPick.player_id);
      if (!inPlayer) {
        used.delete(inPick.id);
        continue;
      }

      const posLabel = wanted.toUpperCase();
      const { error: inErr } = await admin
        .from("fantasy_squad_picks")
        .update({
          is_starter: true,
          slot_order: out.slot_order,
          picked_position: wanted,
          lineup_swap_note: `Swapped on for ${outPlayer.name}, who isn't in the official starting XI — scores as ${posLabel}.`,
          lineup_swapped_at: nowIso,
        })
        .eq("id", inPick.id);
      if (inErr) {
        skipped.push(`swap in ${inPlayer.name}: ${inErr.message}`);
        used.delete(inPick.id);
        continue;
      }

      const { error: outErr } = await admin
        .from("fantasy_squad_picks")
        .update({
          is_starter: false,
          slot_order: inPick.slot_order,
          picked_position: outPlayer.position,
          lineup_swap_note: `Moved to the bench — not in the official starting XI. ${inPlayer.name} takes the ${posLabel} slot.`,
          lineup_swapped_at: nowIso,
        })
        .eq("id", out.id);
      if (outErr) {
        skipped.push(`bench ${outPlayer.name}: ${outErr.message}`);
        continue;
      }

      changed += 1;
      swaps.push(`${inPlayer.name} in for ${outPlayer.name} (${posLabel})`);
    }

    if (changed > 0) {
      squadsChanged += 1;
      await admin.from("fantasy_squads").update({ updated_at: nowIso }).eq("id", squad.id);
    }
  }

  return { ok: true, gameweek: gameweek.gw_number, squadsChanged, swaps, skipped };
}

/**
 * Find the gameweek whose fixture is about to kick off (or just has), read the
 * official eleven from the match feed, and apply the swaps.
 */
export async function syncLineupSwaps(opts?: { ignoreWindow?: boolean }): Promise<LineupSwapResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchBoroStarterIds } = await import("@/lib/fantasy-live-stats.server");
  const { isFantasyLeagueCompetition } = await import("@/lib/fantasy-rules");

  const nowMs = Date.now();
  const { data: gws, error } = await supabaseAdmin
    .from("fantasy_gameweeks")
    .select(
      "id, gw_number, status, boro_fixtures!inner(id, kickoff_at, home_team, away_team, status, competition)",
    )
    .order("gw_number", { ascending: true });
  if (error) return { ok: false, squadsChanged: 0, swaps: [], skipped: [], error: error.message };

  const target = ((gws ?? []) as Array<Record<string, any>>).find((raw) => {
    const fx = raw['boro_fixtures'];
    if (!fx || !isFantasyLeagueCompetition(fx.competition)) return false;
    if (opts?.ignoreWindow) return true;
    const ko = Date.parse(fx.kickoff_at);
    if (!Number.isFinite(ko)) return false;
    // Team sheets land about an hour before kick-off; keep watching into the
    // first half in case the feed is late.
    return nowMs >= ko - 3 * 3600_000 && nowMs <= ko + 2 * 3600_000;
  });
  if (!target) {
    return { ok: true, squadsChanged: 0, swaps: [], skipped: ["no gameweek inside the team-news window"] };
  }

  const { data: playerRows, error: pErr } = await supabaseAdmin
    .from("fantasy_players")
    .select("id, name, position, alt_position");
  if (pErr) return { ok: false, squadsChanged: 0, swaps: [], skipped: [], error: pErr.message };
  const players = (playerRows ?? []) as PlayerRow[];

  let starterIds = await fetchBoroStarterIds(target['boro_fixtures'], players);
  if (!starterIds) {
    const { fetchTeamSheetStarterIds } = await import("@/lib/fantasy-team-sheet-lineup.server");
    starterIds = await fetchTeamSheetStarterIds(
      supabaseAdmin as unknown as Admin,
      target['boro_fixtures'].id,
      players,
    );
  }
  if (!starterIds) {
    return {
      ok: true,
      gameweek: target['gw_number'],
      squadsChanged: 0,
      swaps: [],
      skipped: ["official starting XI not published yet"],
    };
  }

  return applyLineupSwapsForGameweek(
    supabaseAdmin as unknown as Admin,
    { id: target['id'], gw_number: target['gw_number'] },
    starterIds,
    players,
  );
}
