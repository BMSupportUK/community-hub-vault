import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  FantasyLeaderboardRow,
  FantasyStateDTO,
} from "@/lib/fantasy.server";

export type {
  FantasyLeaderboardRow,
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
  bench: z.array(z.string().uuid()).length(4),
  captainId: z.string().uuid(),
  viceId: z.string().uuid(),
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
// Admin: real club transfer feed
// ------------------------------------------------------------------
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
        await admin.from("fantasy_players").update({ status: "departed" }).eq("id", playerId!);
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
