/** Server-only core for the MFC Fantasy Manager (shared by member + guest server fns). */
import {
  benchRulesFor,
  FORMATIONS,
  formationPositionRange,
  formationRows,
  POSITION_SHORT,
  playerPositions,
  resolveSlotPosition,
  rowPositions,
  xiFitsFormation,
  type FantasyPosition,
  type FormationKey,
} from "@/lib/fantasy-rules";

export type Owner = { userId: string; guestId?: never } | { guestId: string; userId?: never };

export type FantasyPlayerDTO = {
  id: string;
  name: string;
  position: FantasyPosition;
  /** Optional second position the player can be picked in. */
  altPosition?: FantasyPosition | null;
  shirtNumber: number | null;
  valueM: number;
  status: "active" | "injured" | "suspended" | "departed" | "loaned_out";
  departedAt?: string | null;
  /** Club the player is currently on loan at, when out on loan. */
  loanClub?: string | null;
  /** Parent club, when the player is at Boro on loan. */
  loanFrom?: string | null;
  /** Which club squad the player sits in: first team, U21 or U18. */
  squadLevel?: "first" | "u21" | "u18";
  /** Total fantasy points this player has earned so far this season. */
  seasonPoints?: number;
  /** Injury/suspension flag: shown as an icon, but the player stays selectable. */
  injuryStatus?: "none" | "doubtful" | "out" | "suspended";
  injuryNote?: string | null;
  injuryReturn?: string | null;
  injurySource?: "feed" | "admin" | null;
  /** Named in the club's official 25-man matchday squad (league games only). */
  in25Squad?: boolean;
};

export type FantasyGameweekDTO = {
  id: string;
  gwNumber: number;
  fixtureId: string;
  lockAt: string;
  status: "upcoming" | "locked" | "final";
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  homeScore: number | null;
  awayScore: number | null;
  fixtureStatus: string;
  /** Tie drawn but date/kick-off not confirmed yet. */
  dateTbc?: boolean;
};

export type FantasyPickDTO = {
  playerId: string;
  isStarter: boolean;
  slotOrder: number;
  buyValueM: number;
  points: number | null;
  /** The position this player is scored in for this squad (slot position). */
  pickedPosition?: FantasyPosition | null;
  /** True when this bench player was automatically subbed in for a starter who didn't play. */
  autoSubbed?: boolean;
  /** Minutes the player actually played in this gameweek's fixture (null = no stats yet). */
  minutes?: number | null;
};

export type FantasySquadDTO = {
  id: string;
  gameweekId: string;
  formation: FormationKey;
  captainId: string | null;
  viceId: string | null;
  transferCost: number;
  points: number | null;
  picks: FantasyPickDTO[];
};

export type FantasyStateDTO = {
  joined: boolean;
  teamName: string;
  freeTransfers: number;
  wildcardUsed: boolean;
  players: FantasyPlayerDTO[];
  gameweeks: FantasyGameweekDTO[];
  currentGameweekId: string | null;
  squads: FantasySquadDTO[];
  clubTransfers: {
    id: string;
    playerName: string;
    direction: "in" | "out";
    otherClub: string | null;
    fee: string | null;
    windowLabel: string | null;
    transferDate: string;
    note: string | null;
  }[];
  myTransfers: {
    id: string;
    gameweekId: string;
    outPlayerId: string | null;
    inPlayerId: string | null;
    cost: number;
    forced: boolean;
    createdAt: string;
  }[];
};

export async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const ownerCol = (o: Owner) => (o.userId ? "user_id" : "guest_id");
const ownerVal = (o: Owner) => (o.userId ?? o.guestId) as string;

export function mapPlayer(r: any): FantasyPlayerDTO {
  return {
    id: r.id,
    name: r.name,
    position: r.position,
    altPosition: (r.alt_position ?? null) as FantasyPosition | null,
    shirtNumber: r.shirt_number ?? null,
    valueM: Number(r.value_m),
    status: r.status,
    departedAt: r.departed_at ?? null,
    loanClub: r.loan_club ?? null,
    loanFrom: r.loan_from ?? null,
    squadLevel: (r.squad_level ?? "first") as "first" | "u21" | "u18",
    injuryStatus: (r.injury_status ?? "none") as "none" | "doubtful" | "out" | "suspended",
    injuryNote: r.injury_note ?? null,
    injuryReturn: r.injury_return ?? null,
    injurySource: (r.injury_source ?? null) as "feed" | "admin" | null,
    in25Squad: r.in_25_squad !== false,
  };
}

export function mapGameweek(r: any): FantasyGameweekDTO {
  const f = r.fixture ?? {};
  return {
    id: r.id,
    gwNumber: r.gw_number,
    fixtureId: r.fixture_id,
    lockAt: r.lock_at,
    status: r.status,
    competition: f.competition ?? "Championship",
    homeTeam: f.home_team ?? "",
    awayTeam: f.away_team ?? "",
    kickoffAt: f.kickoff_at ?? r.lock_at,
    homeScore: f.home_score ?? null,
    awayScore: f.away_score ?? null,
    fixtureStatus: f.status ?? "SCHEDULED",
    dateTbc: f.date_tbc === true,
  };
}

function mapSquad(r: any): FantasySquadDTO {
  return {
    id: r.id,
    gameweekId: r.gameweek_id,
    formation: r.formation,
    captainId: r.captain_id ?? null,
    viceId: r.vice_id ?? null,
    transferCost: r.transfer_cost ?? 0,
    points: r.points ?? null,
    picks: (r.picks ?? []).map((p: any) => ({
      playerId: p.player_id,
      isStarter: !!p.is_starter,
      slotOrder: p.slot_order ?? 0,
      buyValueM: Number(p.buy_value_m),
      points: p.points ?? null,
      pickedPosition: (p.picked_position ?? null) as FantasyPosition | null,
      autoSubbed: !!p.auto_subbed,
    })),
  };
}

export async function loadPlayers(admin: any): Promise<FantasyPlayerDTO[]> {
  const [{ data, error }, statsRes] = await Promise.all([
    admin
      .from("fantasy_players")
      .select(
        "id, name, position, alt_position, shirt_number, value_m, status, departed_at, loan_club, loan_from, squad_level, injury_status, injury_note, injury_return, injury_source, in_25_squad",
      )
      .order("sort_order", { ascending: true }),
    admin.from("fantasy_player_stats").select("player_id, points"),
  ]);
  if (error) throw new Error(error.message);
  const totals = new Map<string, number>();
  for (const r of (statsRes?.data ?? []) as any[]) {
    totals.set(r.player_id, (totals.get(r.player_id) ?? 0) + (Number(r.points) || 0));
  }
  return (data ?? []).map((r: any) => ({ ...mapPlayer(r), seasonPoints: totals.get(r.id) ?? 0 }));
}

export async function loadGameweeks(admin: any): Promise<FantasyGameweekDTO[]> {
  const { isFantasyLeagueCompetition } = await import("@/lib/fantasy-rules");
  const { data, error } = await admin
    .from("fantasy_gameweeks")
    .select(
      "id, gw_number, fixture_id, lock_at, status, fixture:boro_fixtures!inner(competition, home_team, away_team, kickoff_at, home_score, away_score, status, date_tbc)",
    )
    .order("gw_number", { ascending: true });
  if (error) throw new Error(error.message);
  // Competitive fixtures only — league, cup and play-off games; no friendlies.
  return (data ?? [])
    .filter((r: any) => isFantasyLeagueCompetition(r.fixture?.competition))
    .map(mapGameweek);
}

/** The gameweek the manager should be picking for: first one still unlocked. */
export function pickCurrentGameweek(gws: FantasyGameweekDTO[]): string | null {
  const now = Date.now();
  // Skip anything called off — it isn't the next game until a new date lands.
  const open = gws.find(
    (g) =>
      g.status === "upcoming" &&
      new Date(g.lockAt).getTime() > now &&
      !g.dateTbc &&
      !/postpon|cancel|abandon|suspend/i.test(g.fixtureStatus ?? ""),
  );
  if (open) return open.id;
  return gws.length ? (gws[gws.length - 1]!.id) : null;
}

export async function loadState(admin: any, owner: Owner | null): Promise<FantasyStateDTO> {
  // Only current game players belong in the selection pool. Keep an unavailable
  // player solely when this manager has a historical saved pick referencing them,
  // so past gameweek points still render without listing them as a new option.
  function visiblePlayers(
    all: FantasyPlayerDTO[],
    mySquads: FantasySquadDTO[],
  ): FantasyPlayerDTO[] {
    const picked = new Set<string>();
    for (const s of mySquads) for (const p of s.picks) picked.add(p.playerId);
    return all.filter((p) => {
      if (p.status === "active" || p.status === "injured" || p.status === "suspended") return true;
      return picked.has(p.id);
    });
  }

  const [players, gameweeks, clubTransfersRes] = await Promise.all([
    loadPlayers(admin),
    loadGameweeks(admin),
    admin
      .from("fantasy_club_transfers")
      .select("id, player_name, direction, other_club, fee, window_label, transfer_date, note")
      // Only the 2026/27 season's business — the window opens 1 June 2026.
      .gte("transfer_date", "2026-06-01")
      .order("transfer_date", { ascending: false }),
  ]);

  let joined = false;
  let teamName = "My Boro XI";
  let freeTransfers = 1;
  let wildcardUsed = false;
  let squads: FantasySquadDTO[] = [];
  let myTransfers: FantasyStateDTO["myTransfers"] = [];

  if (owner) {
    const table = owner.userId ? "fantasy_entrants" : "fantasy_guest_entrants";
    const idCol = owner.userId ? "user_id" : "id";
    const { data: ent } = await admin
      .from(table)
      .select("team_name, free_transfers, wildcard_used")
      .eq(idCol, ownerVal(owner))
      .maybeSingle();
    if (ent) {
      joined = true;
      teamName = (ent as any).team_name ?? teamName;
      freeTransfers = (ent as any).free_transfers ?? 1;
      wildcardUsed = !!(ent as any).wildcard_used;
    }

    const { data: sq, error: sqErr } = await admin
      .from("fantasy_squads")
      .select(
        "id, gameweek_id, formation, captain_id, vice_id, transfer_cost, points, picks:fantasy_squad_picks(player_id, is_starter, slot_order, buy_value_m, points, auto_subbed, picked_position)",
      )
      .eq(ownerCol(owner), ownerVal(owner));
    if (sqErr) throw new Error(sqErr.message);
    squads = (sq ?? []).map(mapSquad);

    // Minutes played, so the pitch view can show each player's game time.
    const fixtureByGw = new Map(gameweeks.map((g) => [g.id, g.fixtureId]));
    const fixtureIds = [...new Set(squads.map((s) => fixtureByGw.get(s.gameweekId)).filter(Boolean))] as string[];
    if (fixtureIds.length) {
      const { data: mins } = await admin
        .from("fantasy_player_stats")
        .select("fixture_id, player_id, minutes")
        .in("fixture_id", fixtureIds);
      const minMap = new Map<string, number>();
      for (const r of (mins ?? []) as any[]) minMap.set(`${r.fixture_id}:${r.player_id}`, Number(r.minutes) || 0);
      squads = squads.map((s) => {
        const fx = fixtureByGw.get(s.gameweekId);
        return {
          ...s,
          picks: s.picks.map((p) => ({
            ...p,
            minutes: fx ? (minMap.get(`${fx}:${p.playerId}`) ?? null) : null,
          })),
        };
      });
    }

    const { data: tr } = await admin
      .from("fantasy_transfers")
      .select("id, gameweek_id, out_player_id, in_player_id, cost, forced, created_at")
      .eq(ownerCol(owner), ownerVal(owner))
      .order("created_at", { ascending: false });
    myTransfers = (tr ?? []).map((r: any) => ({
      id: r.id,
      gameweekId: r.gameweek_id,
      outPlayerId: r.out_player_id,
      inPlayerId: r.in_player_id,
      cost: r.cost ?? 0,
      forced: !!r.forced,
      createdAt: r.created_at,
    }));
  }

  return {
    joined,
    teamName,
    freeTransfers,
    wildcardUsed,
    players: visiblePlayers(players, squads),
    gameweeks,
    currentGameweekId: pickCurrentGameweek(gameweeks),
    squads,
    myTransfers,
    clubTransfers: (clubTransfersRes?.data ?? []).map((r: any) => ({
      id: r.id,
      playerName: r.player_name,
      direction: r.direction,
      otherClub: r.other_club,
      fee: r.fee,
      windowLabel: r.window_label,
      transferDate: r.transfer_date,
      note: r.note,
    })),
  };
}

export async function joinGame(admin: any, owner: Owner, teamName?: string) {
  if (owner.userId) {
    const { error } = await admin
      .from("fantasy_entrants")
      .upsert(
        { user_id: owner.userId, ...(teamName ? { team_name: teamName } : {}) },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
  } else if (teamName) {
    await admin.from("fantasy_guest_entrants").update({ team_name: teamName }).eq("id", owner.guestId);
  }
  return { ok: true };
}

export type SaveSquadInput = {
  gameweekId: string;
  formation: string;
  starters: string[];
  bench: string[];
  captainId: string;
  viceId: string;
  /**
   * Optional per-slot scoring position for the XI (11 entries, same order as
   * `starters`). Used on flexible slots where the manager chooses which of a
   * two-position player's roles he plays. Anything invalid is resolved from the
   * formation instead.
   */
  starterPositions?: (FantasyPosition | null)[];
};

/** Validate + persist a squad for one gameweek, applying transfer costs. */
export async function saveSquad(admin: any, owner: Owner, input: SaveSquadInput) {
  const { data: gwRow, error: gwErr } = await admin
    .from("fantasy_gameweeks")
    .select("id, gw_number, lock_at, status, fixture:boro_fixtures!inner(competition)")
    .eq("id", input.gameweekId)
    .maybeSingle();
  if (gwErr) throw new Error(gwErr.message);
  if (!gwRow) throw new Error("Gameweek not found.");
  if ((gwRow as any).status !== "upcoming" || new Date((gwRow as any).lock_at).getTime() <= Date.now()) {
    throw new Error("This gameweek is locked — squad changes are closed.");
  }

  const squadIds = [...input.starters, ...input.bench];
  if (new Set(squadIds).size !== squadIds.length) throw new Error("Duplicate players in your squad.");
  const bench = benchRulesFor((gwRow as any).fixture?.competition);
  if (squadIds.length !== 11 + bench.size) {
    throw new Error(`Pick exactly ${11 + bench.size} players (11 starters + ${bench.size} subs).`);
  }
  if (input.starters.length !== 11) throw new Error("Your starting XI must have 11 players.");
  if (!FORMATIONS[input.formation as FormationKey]) throw new Error("Unknown formation.");
  if (!input.starters.includes(input.captainId)) throw new Error("Your captain must be in the starting XI.");
  if (!input.starters.includes(input.viceId)) throw new Error("Your vice-captain must be in the starting XI.");
  if (input.captainId === input.viceId) throw new Error("Captain and vice-captain must be different players.");

  const players = await loadPlayers(admin);
  const byId = new Map(players.map((p) => [p.id, p]));
  // Players the manager already holds may stay in the squad even if they've since
  // gone out on loan — they just can't be newly picked.
  const { data: heldRows } = await admin
    .from("fantasy_squads")
    .select("picks:fantasy_squad_picks(player_id)")
    .eq(ownerCol(owner), ownerVal(owner));
  const existingIds = new Set<string>(
    ((heldRows ?? []) as any[]).flatMap((r) => (r.picks ?? []).map((p: any) => p.player_id as string)),
  );
  for (const id of squadIds) {
    const p = byId.get(id);
    if (!p) throw new Error("One of your picks is no longer in the squad list.");
    if (p.status === "departed") throw new Error(`${p.name} has left the club — pick a replacement.`);
    if (p.status === "loaned_out" && !existingIds.has(id)) {
      throw new Error(`${p.name} is out on loan — pick another player.`);
    }
  }

  if (input.bench.length !== bench.size) {
    throw new Error(`${bench.competition} allows ${bench.size} subs — name exactly ${bench.size}.`);
  }

  const benchGk = input.bench.filter((id) => byId.get(id)?.position === "gk").length;
  if (benchGk < bench.minGk) {
    throw new Error(`Your bench must include at least ${bench.minGk} goalkeeper.`);
  }

  // Flexible rows (e.g. the three behind the striker in 4-2-3-1) and players with
  // a second position both widen the shape, so check the XI can be arranged into
  // the formation rather than counting listed positions.
  const range = formationPositionRange(input.formation);
  const sets = input.starters.map((id) => playerPositions(byId.get(id)!));
  if (!xiFitsFormation(input.formation, sets)) {
    const shape = (["gk", "def", "mid", "fwd"] as FantasyPosition[])
      .filter((pos) => range[pos].max > 0)
      .map((pos) =>
        range[pos].min === range[pos].max
          ? `${range[pos].min} ${POSITION_SHORT[pos]}`
          : `${range[pos].min}–${range[pos].max} ${POSITION_SHORT[pos]}`,
      )
      .join(", ");
    throw new Error(`Your XI doesn't match ${input.formation}: needs ${shape}.`);
  }

  // No budget and no transfers: managers rebuild their match day 11 and bench
  // freely every gameweek, so nothing is ever charged.
  const transferCost = 0;

  // The uniqueness on fantasy_squads is a *partial* index (one per owner kind),
  // which ON CONFLICT can't target — find-then-update/insert instead.
  const squadFields = {
    formation: input.formation,
    captain_id: input.captainId,
    vice_id: input.viceId,
    transfer_cost: transferCost,
  };
  const { data: existingSquad } = await admin
    .from("fantasy_squads")
    .select("id")
    .eq("gameweek_id", input.gameweekId)
    .eq(ownerCol(owner), ownerVal(owner))
    .maybeSingle();

  let squadId: string;
  if (existingSquad) {
    squadId = (existingSquad as any).id as string;
    const { error: updErr } = await admin
      .from("fantasy_squads")
      .update(squadFields)
      .eq("id", squadId);
    if (updErr) throw new Error(updErr.message);
  } else {
    const { data: insertedSquad, error: insErr } = await admin
      .from("fantasy_squads")
      .insert({
        gameweek_id: input.gameweekId,
        ...(owner.userId ? { user_id: owner.userId } : { guest_id: owner.guestId }),
        ...squadFields,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    squadId = (insertedSquad as any).id as string;
  }

  await admin.from("fantasy_squad_picks").delete().eq("squad_id", squadId);
  const rows = [
    ...input.starters.map((id, i) => ({
      squad_id: squadId,
      player_id: id,
      is_starter: true,
      slot_order: i,
      buy_value_m: byId.get(id)!.valueM,
    })),
    ...input.bench.map((id, i) => ({
      squad_id: squadId,
      player_id: id,
      is_starter: false,
      slot_order: i,
      buy_value_m: byId.get(id)!.valueM,
    })),
  ];
  const { error: pickErr } = await admin.from("fantasy_squad_picks").insert(rows);
  if (pickErr) throw new Error(pickErr.message);

  // No transfer log any more: team changes are free and unlimited.
  await admin
    .from("fantasy_transfers")
    .delete()
    .eq("gameweek_id", input.gameweekId)
    .eq(ownerCol(owner), ownerVal(owner));

  return { ok: true, transferCost, transfersMade: 0 };
}

/**
 * Kept for the gameweek-lock hook. Transfers were removed from the game, so
 * there is nothing to bank or charge any more.
 */
export async function rollFreeTransfers(_admin: any, _gameweekId: string) {
  return;
}

export type FantasyLeaderboardRow = {
  entrantId: string;
  isGuest: boolean;
  teamName: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  totalPoints: number;
  totalHits: number;
  gameweeksScored: number;
  email: string | null;
};

export async function loadLeaderboard(admin: any, withEmails: boolean): Promise<FantasyLeaderboardRow[]> {
  const { data, error } = await admin
    .from("fantasy_leaderboard")
    .select("*")
    .order("total_points", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const emailMap = new Map<string, string>();
  if (withEmails) {
    const userIds = new Set(rows.filter((r) => !r.is_guest).map((r) => r.entrant_id as string));
    const guestIds = rows.filter((r) => r.is_guest).map((r) => r.entrant_id as string);
    if (userIds.size) {
      for (let page = 1; page < 20; page++) {
        const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        const users = list?.users ?? [];
        for (const u of users) if (userIds.has(u.id) && u.email) emailMap.set(u.id, u.email);
        if (users.length < 1000) break;
      }
    }
    if (guestIds.length) {
      const { data: gs } = await admin
        .from("fantasy_guest_entrants")
        .select("id, email")
        .in("id", guestIds);
      for (const g of gs ?? []) if ((g as any).email) emailMap.set((g as any).id, (g as any).email);
    }
  }
  return rows.map((r) => ({
    entrantId: r.entrant_id,
    isGuest: !!r.is_guest,
    teamName: r.team_name ?? "My Boro XI",
    displayName: r.display_name ?? null,
    username: r.username ?? null,
    avatarUrl: r.avatar_url ?? null,
    totalPoints: r.total_points ?? 0,
    totalHits: r.total_hits ?? 0,
    gameweeksScored: r.gameweeks_scored ?? 0,
    email: emailMap.get(r.entrant_id) ?? null,
  }));
}
