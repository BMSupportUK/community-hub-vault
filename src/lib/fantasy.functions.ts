import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  FantasyLeaderboardRow,
  FantasyPreviousGwScoreDTO,
  FantasyStateDTO,
} from "@/lib/fantasy.server";
import type { FantasySwapHistoryRow } from "@/lib/fantasy-swap-history.server";

export type { FantasySwapHistoryRow } from "@/lib/fantasy-swap-history.server";

export type {
  FantasyLeaderboardRow,
  FantasyPreviousGwScoreDTO,
  FantasyStateDTO,
  FantasyPlayerDTO,
  FantasyGameweekDTO,
  FantasySquadDTO,
  FantasyPickDTO,
} from "@/lib/fantasy.server";

async function isAdminOrManagement(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const rs = new Set((data ?? []).map((r: any) => r.role));
  return rs.has("admin") || rs.has("management");
}

// ------------------------------------------------------------------
// Member reads
// ------------------------------------------------------------------
export const getFantasyState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FantasyStateDTO> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { getAdmin, loadState } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    return loadState(admin, { userId: context.userId });
  });

export const getFantasyLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FantasyLeaderboardRow[]> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { getAdmin, loadLeaderboard } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const canSeeEmails = await isAdminOrManagement(context.supabase, context.userId);
    return loadLeaderboard(admin, canSeeEmails);
  });

export const getFantasyPreviousGameweekScores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<FantasyPreviousGwScoreDTO | null> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { getAdmin, loadPreviousGameweekScores } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    return loadPreviousGameweekScores(admin);
  });

/** Every automatic line-up swap ever applied to the signed-in manager's squads. */
export const getFantasySwapHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FantasySwapHistoryRow[]> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const { loadSwapHistory } = await import("@/lib/fantasy-swap-history.server");
    const admin = await getAdmin();
    return loadSwapHistory(admin, { userId: context.userId });
  });

// ------------------------------------------------------------------
// Member writes
// ------------------------------------------------------------------
export const joinFantasyGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ teamName: z.string().trim().min(1).max(40).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { getAdmin, joinGame } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    return joinGame(admin, { userId: context.userId }, data.teamName);
  });

export const setFantasyTeamName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ teamName: z.string().trim().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { error } = await admin
      .from("fantasy_entrants")
      .upsert({ user_id: context.userId, team_name: data.teamName }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const saveSquadSchema = z.object({
  gameweekId: z.string().uuid(),
  formation: z.string().min(3).max(8),
  starters: z.array(z.string().uuid()).length(11),
  // Competition-specific bench size is validated in saveSquad against the
  // selected gameweek. Do not hard-code it in this RPC boundary.
  bench: z.array(z.string().uuid()),
  captainId: z.string().uuid(),
  viceId: z.string().uuid(),
  // Chosen scoring position per XI slot; only flexible slots ever differ from
  // the default resolved from the formation.
  starterPositions: z.array(z.enum(["gk", "def", "mid", "fwd"]).nullable()).length(11).optional(),
  // Chosen scoring position per bench slot for two-position subs.
  benchPositions: z.array(z.enum(["gk", "def", "mid", "fwd"]).nullable()).optional(),
});

export const saveFantasySquad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSquadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, saveSquad } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { data: ent } = await admin
      .from("fantasy_entrants")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!ent) throw new Error("Join the fantasy game before saving a squad.");
    return saveSquad(admin, { userId: context.userId }, data);
  });

// ------------------------------------------------------------------
// Admin: player pool
// ------------------------------------------------------------------
const playerSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  position: z.enum(["gk", "def", "mid", "fwd"]),
  shirtNumber: z.number().int().min(1).max(99).nullable().optional(),
  valueM: z.number().min(0).max(20),
  status: z.enum(["active", "injured", "suspended", "departed"]),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const adminUpsertFantasyPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => playerSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const payload = {
      name: data.name,
      position: data.position,
      shirt_number: data.shirtNumber ?? null,
      value_m: data.valueM,
      status: data.status,
      ...(typeof data.sortOrder === "number" ? { sort_order: data.sortOrder } : {}),
    };
    if (data.id) {
      const { error } = await admin.from("fantasy_players").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await admin.from("fantasy_players").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as any).id as string };
  });

/**
 * Admin/management: remove a manager (member or guest) from the fantasy game.
 * Deletes their entry, squads, picks and transfers so they drop off the leaderboard.
 */
export const adminRemoveFantasyEntrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ entrantId: z.string().uuid(), isGuest: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const col = data.isGuest ? "guest_id" : "user_id";

    // Squad picks hang off squads, so clear those first.
    const { data: squads } = await admin.from("fantasy_squads").select("id").eq(col, data.entrantId);
    const squadIds = ((squads ?? []) as any[]).map((s) => s.id as string);
    if (squadIds.length) {
      const { error: pickErr } = await admin.from("fantasy_squad_picks").delete().in("squad_id", squadIds);
      if (pickErr) throw new Error(pickErr.message);
    }
    for (const table of ["fantasy_transfers", "fantasy_squads"] as const) {
      const { error } = await admin.from(table).delete().eq(col, data.entrantId);
      if (error) throw new Error(error.message);
    }
    const { error } = data.isGuest
      ? await admin.from("fantasy_guest_entrants").delete().eq("id", data.entrantId)
      : await admin.from("fantasy_entrants").delete().eq("user_id", data.entrantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteFantasyPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { error } = await admin.from("fantasy_players").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------------------------------------------------------
// Admin: gameweeks
// ------------------------------------------------------------------
/** Pull the current first-team squad from mfc.co.uk into the player pool. */
export const adminSyncFantasyPlayersFromClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const { syncFantasyPlayersFromClub } = await import("@/lib/fantasy-squad-sync.server");
    const admin = await getAdmin();
    return await syncFantasyPlayersFromClub(admin as never);
  });

/** Create a gameweek for every Boro league fixture that doesn't have one yet. */
export const adminSyncFantasyGameweeks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const { syncFantasyGameweeksFromFixtures } = await import("@/lib/fantasy-gameweeks.server");
    const admin = await getAdmin();
    return await syncFantasyGameweeksFromFixtures(admin as never);
  });

export const adminSetFantasyGameweekStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ gameweekId: z.string().uuid(), status: z.enum(["upcoming", "locked", "final"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin, rollFreeTransfers } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { error } = await admin
      .from("fantasy_gameweeks")
      .update({ status: data.status })
      .eq("id", data.gameweekId);
    if (error) throw new Error(error.message);
    if (data.status === "locked") await rollFreeTransfers(admin, data.gameweekId);
    return { ok: true };
  });

export const adminDeleteFantasyGameweek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ gameweekId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { error } = await admin.from("fantasy_gameweeks").delete().eq("id", data.gameweekId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------------------------------------------------------
// Admin: match stats
// ------------------------------------------------------------------
export type FantasyStatRowDTO = {
  playerId: string;
  minutes: number;
  goals: number;
  assists: number;
  saves: number;
  pensSaved: number;
  pensMissed: number;
  goalsConceded: number;
  yellows: number;
  reds: number;
  ownGoals: number;
  bonus: number;
  points: number;
};

export const getFantasyFixtureStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fixtureId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<FantasyStatRowDTO[]> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("fantasy_player_stats")
      .select("*")
      .eq("fixture_id", data.fixtureId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      playerId: r.player_id,
      minutes: r.minutes ?? 0,
      goals: r.goals ?? 0,
      assists: r.assists ?? 0,
      saves: r.saves ?? 0,
      pensSaved: r.pens_saved ?? 0,
      pensMissed: r.pens_missed ?? 0,
      goalsConceded: r.goals_conceded ?? 0,
      yellows: r.yellows ?? 0,
      reds: r.reds ?? 0,
      ownGoals: r.own_goals ?? 0,
      bonus: r.bonus ?? 0,
      points: r.points ?? 0,
    }));
  });

const statSchema = z.object({
  gameweekId: z.string().uuid(),
  fixtureId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        playerId: z.string().uuid(),
        minutes: z.number().int().min(0).max(130),
        goals: z.number().int().min(0).max(20),
        assists: z.number().int().min(0).max(20),
        saves: z.number().int().min(0).max(40),
        pensSaved: z.number().int().min(0).max(10),
        pensMissed: z.number().int().min(0).max(10),
        goalsConceded: z.number().int().min(0).max(20),
        yellows: z.number().int().min(0).max(2),
        reds: z.number().int().min(0).max(1),
        ownGoals: z.number().int().min(0).max(5),
        bonus: z.number().int().min(-10).max(10),
      }),
    )
    .max(60),
});

export const adminSaveFantasyStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => statSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    if (data.rows.length) {
      const payload = data.rows.map((r) => ({
        fixture_id: data.fixtureId,
        player_id: r.playerId,
        minutes: r.minutes,
        goals: r.goals,
        assists: r.assists,
        saves: r.saves,
        pens_saved: r.pensSaved,
        pens_missed: r.pensMissed,
        goals_conceded: r.goalsConceded,
        yellows: r.yellows,
        reds: r.reds,
        own_goals: r.ownGoals,
        bonus: r.bonus,
      }));
      const { error } = await admin
        .from("fantasy_player_stats")
        .upsert(payload as never, { onConflict: "fixture_id,player_id" });
      if (error) throw new Error(error.message);
    }
    const { error: scoreErr } = await admin.rpc("fantasy_score_gameweek" as never, {
      _gameweek_id: data.gameweekId,
    } as never);
    if (scoreErr) throw new Error(scoreErr.message);
    return { ok: true };
  });

export const adminRescoreFantasy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { data: gws, error } = await admin.from("fantasy_gameweeks").select("id");
    if (error) throw new Error(error.message);
    for (const g of gws ?? []) {
      await admin.rpc("fantasy_score_gameweek" as never, { _gameweek_id: (g as any).id } as never);
    }
    return { ok: true, count: (gws ?? []).length };
  });

// ------------------------------------------------------------------
// Admin: Man of the match
// ------------------------------------------------------------------
export const MOTM_BONUS = 3;

export type FantasyMotmGameweek = {
  gameweekId: string;
  gwNumber: number;
  fixtureId: string;
  label: string;
  competition: string;
  kickoffAt: string;
  dateTbc: boolean;
  status: string;
  motmPlayerId: string | null;
  playedPlayerIds: string[];
};
export type FantasyMotmPlayer = { id: string; name: string; position: string; squadLevel: string };

export const getFantasyMotmData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ gameweeks: FantasyMotmGameweek[]; players: FantasyMotmPlayer[] }> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const [{ data: gws }, { data: players }, { data: stats }] = await Promise.all([
      admin
        .from("fantasy_gameweeks")
        .select("id, gw_number, fixture_id, status, boro_fixtures!inner(home_team, away_team, competition, kickoff_at, date_tbc)")
        .order("gw_number", { ascending: true }),
      admin
        .from("fantasy_players")
        .select("id, name, position, squad_level")
        .in("status", ["active", "injured", "suspended"])
        .order("sort_order", { ascending: true }),
      admin.from("fantasy_player_stats").select("fixture_id, player_id, bonus, minutes"),
    ]);
    const byFixture = new Map<string, { motm: string | null; played: string[] }>();
    for (const s of (stats ?? []) as any[]) {
      const entry = byFixture.get(s.fixture_id) ?? { motm: null, played: [] };
      if ((s.bonus ?? 0) >= MOTM_BONUS) entry.motm = s.player_id;
      if ((s.minutes ?? 0) > 0) entry.played.push(s.player_id);
      byFixture.set(s.fixture_id, entry);
    }
    return {
      gameweeks: ((gws ?? []) as any[]).map((g) => {
        const f = g.boro_fixtures;
        const e = byFixture.get(g.fixture_id);
        return {
          gameweekId: g.id,
          gwNumber: g.gw_number,
          fixtureId: g.fixture_id,
          label: `${f.home_team} v ${f.away_team}`,
          competition: f.competition,
          kickoffAt: f.kickoff_at,
          dateTbc: !!f.date_tbc,
          status: g.status,
          motmPlayerId: e?.motm ?? null,
          playedPlayerIds: e?.played ?? [],
        };
      }),
      players: ((players ?? []) as any[]).map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        squadLevel: p.squad_level ?? "first",
      })),
    };
  });

export const adminSetFantasyMotm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        gameweekId: z.string().uuid(),
        fixtureId: z.string().uuid(),
        playerId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    // Clear any existing man-of-the-match bonus for this fixture
    const { error: clearErr } = await admin
      .from("fantasy_player_stats")
      .update({ bonus: 0 } as never)
      .eq("fixture_id", data.fixtureId)
      .gt("bonus", 0);
    if (clearErr) throw new Error(clearErr.message);
    if (data.playerId) {
      const { data: existing } = await admin
        .from("fantasy_player_stats")
        .select("id")
        .eq("fixture_id", data.fixtureId)
        .eq("player_id", data.playerId)
        .maybeSingle();
      if (existing) {
        const { error } = await admin
          .from("fantasy_player_stats")
          .update({ bonus: MOTM_BONUS } as never)
          .eq("id", (existing as any).id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await admin
          .from("fantasy_player_stats")
          .insert({ fixture_id: data.fixtureId, player_id: data.playerId, bonus: MOTM_BONUS } as never);
        if (error) throw new Error(error.message);
      }
    }
    const { error: scoreErr } = await admin.rpc("fantasy_score_gameweek" as never, {
      _gameweek_id: data.gameweekId,
    } as never);
    if (scoreErr) throw new Error(scoreErr.message);
    // Man of the match is the final step of a gameweek: close it out once a
    // winner is set, reopen it if the award is cleared.
    await admin
      .from("fantasy_gameweeks")
      .update({ status: data.playerId ? "final" : "locked" } as never)
      .eq("id", data.gameweekId);
    return { ok: true };
  });

// ------------------------------------------------------------------
// Admin: real club transfer feed
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Admin: injuries / suspensions
// ------------------------------------------------------------------
export type FantasyInjuryPlayer = {
  id: string;
  name: string;
  position: string;
  squadLevel: string;
  status: string;
  injuryStatus: "none" | "doubtful" | "out" | "suspended";
  injuryNote: string | null;
  injuryReturn: string | null;
  injurySource: "feed" | "admin" | null;
  injuryUpdatedAt: string | null;
  in25Squad: boolean;
};

export const getFantasyInjuries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FantasyInjuryPlayer[]> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("fantasy_players")
      .select(
        "id, name, position, squad_level, status, injury_status, injury_note, injury_return, injury_source, injury_updated_at, in_25_squad",
      )
      .in("status", ["active", "injured", "suspended"])
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      squadLevel: p.squad_level ?? "first",
      status: p.status,
      injuryStatus: (p.injury_status ?? "none") as FantasyInjuryPlayer["injuryStatus"],
      injuryNote: p.injury_note ?? null,
      injuryReturn: p.injury_return ?? null,
      injurySource: (p.injury_source ?? null) as FantasyInjuryPlayer["injurySource"],
      injuryUpdatedAt: p.injury_updated_at ?? null,
      in25Squad: p.in_25_squad !== false,
    }));
  });

/** Admin: name (or drop) a player in the club's official 25-man matchday squad. */
export const adminSetFantasyIn25Squad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ playerId: z.string().uuid(), in25Squad: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { error } = await admin
      .from("fantasy_players")
      .update({ in_25_squad: data.in25Squad } as never)
      .eq("id", data.playerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetFantasyInjury = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        playerId: z.string().uuid(),
        injuryStatus: z.enum(["none", "doubtful", "out", "suspended"]),
        note: z.string().trim().max(120).nullable().optional(),
        expectedReturn: z.string().trim().max(60).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const clear = data.injuryStatus === "none";
    const { error } = await admin
      .from("fantasy_players")
      .update({
        injury_status: data.injuryStatus,
        injury_note: clear ? null : (data.note?.trim() || null),
        injury_return: clear ? null : (data.expectedReturn?.trim() || null),
        injury_source: clear ? null : "admin",
        injury_updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.playerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------------------------------------------------------
// Admin: squad numbers
// ------------------------------------------------------------------
export type FantasySquadNumberPlayer = {
  id: string;
  name: string;
  position: string;
  /** Optional second position the player can also be picked in. */
  altPosition: string | null;
  squadLevel: string;
  status: string;
  shirtNumber: number | null;
  shirtNumberLocked: boolean;
};

/** Every player in the game pool, with their squad number, for the admin editor. */
export const getFantasySquadNumbers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FantasySquadNumberPlayer[]> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("fantasy_players")
      .select("id, name, position, alt_position, squad_level, status, shirt_number, shirt_number_locked")
      .in("status", ["active", "injured", "suspended", "loaned_out"])
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      altPosition: p.alt_position ?? null,
      squadLevel: p.squad_level ?? "first",
      status: p.status,
      shirtNumber: p.shirt_number ?? null,
      shirtNumberLocked: p.shirt_number_locked === true,
    }));
  });

/** Admin: set (or clear) a player's squad number. Manual numbers are locked so
 *  the automatic club squad sync never overwrites them. */
export const adminSetFantasyShirtNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        playerId: z.string().uuid(),
        shirtNumber: z.number().int().min(1).max(99).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    if (data.shirtNumber != null) {
      const { data: clash } = await admin
        .from("fantasy_players")
        .select("id, name")
        .eq("shirt_number", data.shirtNumber)
        .in("status", ["active", "injured", "suspended", "loaned_out"])
        .neq("id", data.playerId)
        .limit(1);
      const other = ((clash ?? []) as any[])[0];
      if (other) throw new Error(`No${data.shirtNumber} is already taken by ${other.name}`);
    }
    const { error } = await admin
      .from("fantasy_players")
      .update({ shirt_number: data.shirtNumber, shirt_number_locked: true } as never)
      .eq("id", data.playerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: give a player an extra position (or clear it) so they can be picked in two positions. */
export const adminSetFantasyAltPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        playerId: z.string().uuid(),
        altPosition: z.enum(["gk", "def", "mid", "fwd"]).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { data: player, error: readErr } = await admin
      .from("fantasy_players")
      .select("position")
      .eq("id", data.playerId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!player) throw new Error("Player not found");
    if (data.altPosition && data.altPosition === (player as any).position) {
      throw new Error("That is already the player's main position.");
    }
    const { error } = await admin
      .from("fantasy_players")
      .update({ alt_position: data.altPosition } as never)
      .eq("id", data.playerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Pull the latest injuries straight from the official EFL Fantasy feed. */
export const adminSyncFantasyInjuries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { syncFantasyInjuriesFromEfl } = await import("@/lib/efl-fantasy-injuries.server");
    return await syncFantasyInjuriesFromEfl(admin as never);
  });

const clubTransferSchema = z.object({
  id: z.string().uuid().optional(),
  playerName: z.string().trim().min(1).max(60),
  direction: z.enum(["in", "out"]),
  otherClub: z.string().trim().max(60).nullable().optional(),
  fee: z.string().trim().max(40).nullable().optional(),
  windowLabel: z.string().trim().max(40).nullable().optional(),
  transferDate: z.string().min(4),
  note: z.string().trim().max(300).nullable().optional(),
  /** Optionally add/remove the player from the game's pool at the same time. */
  applyToPool: z.boolean().optional(),
  position: z.enum(["gk", "def", "mid", "fwd"]).optional(),
  valueM: z.number().min(0).max(20).optional(),
});

export const adminUpsertClubTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clubTransferSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();

    let playerId: string | null = null;
    if (data.applyToPool) {
      const { data: existing } = await admin
        .from("fantasy_players")
        .select("id")
        .ilike("name", data.playerName)
        .maybeSingle();
      if (data.direction === "in") {
        if (existing) {
          playerId = (existing as any).id;
          await admin.from("fantasy_players").update({ status: "active" }).eq("id", playerId!);
        } else {
          const { data: ins, error } = await admin
            .from("fantasy_players")
            .insert({
              name: data.playerName,
              position: data.position ?? "mid",
              value_m: data.valueM ?? 4.5,
              status: "active",
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          playerId = (ins as any).id;
        }
      } else if (existing) {
        playerId = (existing as any).id;
        await admin
          .from("fantasy_players")
          .update({ status: "departed", departed_at: new Date().toISOString() })
          .eq("id", playerId!);
      }
    }

    const payload = {
      player_name: data.playerName,
      direction: data.direction,
      other_club: data.otherClub ?? null,
      fee: data.fee ?? null,
      window_label: data.windowLabel ?? null,
      transfer_date: data.transferDate,
      note: data.note ?? null,
      ...(playerId ? { player_id: playerId } : {}),
    };
    if (data.id) {
      const { error } = await admin.from("fantasy_club_transfers").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await admin
      .from("fantasy_club_transfers")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as any).id as string };
  });

export const adminDeleteClubTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { error } = await admin.from("fantasy_club_transfers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteFantasyEntrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ entrantId: z.string().uuid(), isGuest: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminOrManagement(context.supabase, context.userId))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    if (data.isGuest) {
      await admin.from("fantasy_guest_entrants").delete().eq("id", data.entrantId);
    } else {
      await admin.from("fantasy_squads").delete().eq("user_id", data.entrantId);
      await admin.from("fantasy_entrants").delete().eq("user_id", data.entrantId);
    }
    return { ok: true };
  });

export type FantasyPlayerMatchStats = {
  fixtureId: string;
  gwNumber: number | null;
  label: string;
  kickoffAt: string | null;
  points: number;
  stats: Record<string, number>;
};

export type FantasyPlayerBreakdown = {
  name: string;
  position: string;
  altPosition: string | null;
  shirtNumber: number | null;
  totalPoints: number;
  matches: FantasyPlayerMatchStats[];
};

/** Per-match FotMob stat lines and points earned for one player (public read). */
export const getFantasyPlayerBreakdown = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ playerId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<FantasyPlayerBreakdown> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const { buildPlayerBreakdown } = await import("@/lib/fantasy-player-stats.server");
    const admin = await getAdmin();
    return buildPlayerBreakdown(admin, data.playerId);
  });

// ------------------------------------------------------------------
// Scoring rules (admin editable, publicly readable)
// ------------------------------------------------------------------
export type FantasyScoringRule = {
  key: string;
  label: string;
  statColumn: string | null;
  perN: number;
  points: number;
  positions: string[] | null;
  special: string | null;
  halvesForSubs: boolean;
  enabled: boolean;
  sortOrder: number;
};

export const getFantasyScoringRules = createServerFn({ method: "GET" }).handler(
  async (): Promise<FantasyScoringRule[]> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("fantasy_scoring_rules")
      .select("key, label, stat_column, per_n, points, positions, special, halves_for_subs, enabled, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((r) => ({
      key: r.key as string,
      label: r.label as string,
      statColumn: (r.stat_column ?? null) as string | null,
      perN: Number(r.per_n ?? 1),
      points: Number(r.points ?? 0),
      positions: (r.positions ?? null) as string[] | null,
      special: (r.special ?? null) as string | null,
      halvesForSubs: !!r.halves_for_subs,
      enabled: !!r.enabled,
      sortOrder: Number(r.sort_order ?? 0),
    }));
  },
);

const scoringSaveSchema = z.object({
  updates: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        perN: z.number().int().min(1).max(200),
        points: z.number().min(-50).max(50),
        enabled: z.boolean(),
      }),
    )
    .max(200),
  removals: z.array(z.string().min(1).max(80)).max(200).optional(),
});

export const adminSaveFantasyScoringRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scoringSaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Points scoring is admin-only, not management.
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = ((roleRows ?? []) as any[]).some((r) => r.role === "admin");
    if (!isAdmin) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();

    for (const u of data.updates) {
      const { error } = await admin
        .from("fantasy_scoring_rules")
        .update({ per_n: u.perN, points: u.points, enabled: u.enabled } as never)
        .eq("key", u.key);
      if (error) throw new Error(error.message);
    }

    if (data.removals?.length) {
      const { error } = await admin.from("fantasy_scoring_rules").delete().in("key", data.removals);
      if (error) throw new Error(error.message);
    }

    // Re-score every gameweek that already has stats so the change applies to
    // points already on the board.
    const { data: gws } = await admin
      .from("fantasy_gameweeks")
      .select("id, status")
      .in("status", ["locked", "final"]);
    let rescored = 0;
    for (const g of ((gws ?? []) as any[])) {
      const { error } = await admin.rpc("fantasy_score_gameweek" as never, { _gameweek_id: g.id } as never);
      if (!error) rescored += 1;
    }
    return { ok: true, rescored };
  });
