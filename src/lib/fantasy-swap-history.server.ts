/**
 * Swap history: every automatic line-up swap ever applied to one manager's
 * squads, with the timestamp it happened and the exact rule that allowed it.
 *
 * Nothing extra is stored for this — the rule is re-derived from the pick's
 * recorded scoring position against the player's listed and second positions,
 * so the history always reflects the rules the swap engine actually applies.
 */

export type FantasySwapHistoryRow = {
  id: string;
  gameweek: number;
  fixture: string;
  kickoffAt: string;
  swappedAt: string;
  playerName: string;
  direction: "in" | "out";
  /** Position the player is scored in after the swap. */
  scoringPosition: "gk" | "def" | "mid" | "fwd";
  /** The note recorded on the pick when the swap was made. */
  note: string;
  /** The exact rule that produced this swap. */
  rule: string;
};

const POS_LABEL: Record<string, string> = { gk: "goalkeeper", def: "defender", mid: "midfielder", fwd: "forward" };

function ruleFor(
  direction: "in" | "out",
  scoringPosition: string,
  player: { position: string; alt_position: string | null },
): string {
  const slot = (POS_LABEL[scoringPosition] ?? scoringPosition).toUpperCase();
  if (direction === "out") {
    return `Picked starter not in Middlesbrough's official starting XI — moved to the bench, where he scores sub points (1 for an appearance, half stat points) in his listed position (${(POS_LABEL[player.position] ?? player.position).toUpperCase()}).`;
  }
  const dual = player.alt_position && player.alt_position !== player.position;
  if (scoringPosition === player.position) {
    return `Bench player named in the official starting XI, and his listed position (${slot}) matches the vacated slot — straight like-for-like swap, scored as ${slot}.`;
  }
  if (dual && scoringPosition === player.alt_position) {
    return `Bench player named in the official starting XI. His listed position didn't fit the vacated slot, so his second position (${slot}) was used — dual-position cover, scored as ${slot}.`;
  }
  return `Bench player named in the official starting XI and moved into the ${slot} slot, scored as ${slot}.`;
}

type Owner = { userId: string } | { guestId: string };

/** All automatic swaps for one manager, newest first. */
export async function loadSwapHistory(admin: any, owner: Owner): Promise<FantasySwapHistoryRow[]> {
  const col = "userId" in owner ? "user_id" : "guest_id";
  const value = "userId" in owner ? owner.userId : owner.guestId;

  const { data: squads, error } = await admin
    .from("fantasy_squads")
    .select(
      "id, gameweek_id, picks:fantasy_squad_picks(id, player_id, is_starter, picked_position, lineup_swap_note, lineup_swapped_at)",
    )
    .eq(col, value);
  if (error) throw new Error(error.message);

  const rows = (squads ?? []) as Array<any>;
  const withSwaps = rows
    .map((s) => ({
      gameweekId: s.gameweek_id as string,
      picks: ((s.picks ?? []) as Array<any>).filter((p) => p.lineup_swap_note && p.lineup_swapped_at),
    }))
    .filter((s) => s.picks.length > 0);
  if (withSwaps.length === 0) return [];

  const gwIds = [...new Set(withSwaps.map((s) => s.gameweekId))];
  const playerIds = [...new Set(withSwaps.flatMap((s) => s.picks.map((p) => p.player_id as string)))];

  const [{ data: gws }, { data: players }] = await Promise.all([
    admin
      .from("fantasy_gameweeks")
      .select("id, gw_number, boro_fixtures(kickoff_at, home_team, away_team)")
      .in("id", gwIds),
    admin.from("fantasy_players").select("id, name, position, alt_position").in("id", playerIds),
  ]);

  const gwMap = new Map<string, any>(((gws ?? []) as Array<any>).map((g) => [g.id, g]));
  const playerMap = new Map<string, any>(((players ?? []) as Array<any>).map((p) => [p.id, p]));

  const out: FantasySwapHistoryRow[] = [];
  for (const squad of withSwaps) {
    const gw = gwMap.get(squad.gameweekId);
    const fx = gw?.boro_fixtures ?? null;
    for (const pick of squad.picks) {
      const player = playerMap.get(pick.player_id) ?? { name: "Unknown player", position: "mid", alt_position: null };
      const direction: "in" | "out" = pick.is_starter ? "in" : "out";
      const scoringPosition = (pick.picked_position ?? player.position) as FantasySwapHistoryRow["scoringPosition"];
      out.push({
        id: pick.id as string,
        gameweek: (gw?.gw_number ?? 0) as number,
        fixture: fx ? `${fx.home_team} v ${fx.away_team}` : "Fixture unavailable",
        kickoffAt: (fx?.kickoff_at ?? "") as string,
        swappedAt: pick.lineup_swapped_at as string,
        playerName: player.name as string,
        direction,
        scoringPosition,
        note: pick.lineup_swap_note as string,
        rule: ruleFor(direction, scoringPosition, player),
      });
    }
  }

  return out.sort((a, b) => {
    const t = Date.parse(b.swappedAt) - Date.parse(a.swappedAt);
    if (t !== 0) return t;
    if (a.gameweek !== b.gameweek) return b.gameweek - a.gameweek;
    return a.direction === b.direction ? a.playerName.localeCompare(b.playerName) : a.direction === "in" ? -1 : 1;
  });
}
