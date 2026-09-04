import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BoroFixtureDTO = {
  id: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  venue: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  minute: number | null;
  minuteAdded: number | null;
  monthKey: string | null;
  homeReds: number;
  awayReds: number;
  myPrediction: { homePred: number; awayPred: number; points: number | null } | null;
};

export type BoroLeaderboardRowDTO = {
  userId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  totalPoints: number;
  exactCount: number;
  goalDiffCount: number;
  resultCount: number;
  predictionsMade: number;
  predictionsScored: number;
  email: string | null;
};

async function isAdminOrManagement(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const rs = new Set((data ?? []).map((r: any) => r.role));
  return rs.has("admin") || rs.has("management");
}

async function userCanPredict(supabase: any, userId: string) {
  const { data } = await supabase
    .from("boro_entrants")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

function rowToFixture(f: any): BoroFixtureDTO {
  return {
    id: f.id,
    competition: f.competition ?? "Championship",
    homeTeam: f.home_team,
    awayTeam: f.away_team,
    kickoffAt: f.kickoff_at,
    venue: f.venue ?? null,
    homeScore: f.home_score,
    awayScore: f.away_score,
    status: (f.status as string | null) ?? "SCHEDULED",
    minute: (f.minute as number | null) ?? null,
    minuteAdded: (f.minute_added as number | null) ?? null,
    monthKey: f.month_key ?? null,
    homeReds: (f.home_reds as number | null) ?? 0,
    awayReds: (f.away_reds as number | null) ?? 0,
    myPrediction: null,
  };
}

export const getBoroEntrantStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ joined: boolean }> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("boro_entrants")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { joined: !!data };
  });

export const joinBoroPredictor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("boro_entrants")
      .upsert({ user_id: userId }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listBoroFixtures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BoroFixtureDTO[]> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { supabase, userId } = context;
    const [{ data: fixtures, error: fxErr }, { data: preds, error: prErr }] = await Promise.all([
      supabase
        .from("boro_fixtures")
        .select("id, competition, home_team, away_team, kickoff_at, venue, home_score, away_score, status, minute, minute_added, month_key, home_reds, away_reds")
        .eq("competition", "Championship")
        .order("kickoff_at", { ascending: true }),
      supabase
        .from("boro_predictions")
        .select("fixture_id, home_pred, away_pred, points")
        .eq("user_id", userId),
    ]);
    if (fxErr) throw new Error(fxErr.message);
    if (prErr) throw new Error(prErr.message);
    const predMap = new Map<string, { home_pred: number; away_pred: number; points: number | null }>();
    for (const p of preds ?? []) predMap.set((p as any).fixture_id, p as any);
    return (fixtures ?? []).map((f: any) => {
      const out = rowToFixture(f);
      const p = predMap.get(f.id);
      out.myPrediction = p
        ? { homePred: p.home_pred, awayPred: p.away_pred, points: p.points ?? null }
        : null;
      return out;
    });
  });

const upsertSchema = z.object({
  fixtureId: z.string().uuid(),
  homePred: z.number().int().min(0).max(30),
  awayPred: z.number().int().min(0).max(30),
});

export const upsertBoroPrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const canPredict = await userCanPredict(supabase, userId);
    if (!canPredict) throw new Error("Join the predictor before entering scores.");

    const { data: fx, error: fxErr } = await supabase
      .from("boro_fixtures")
      .select("id, kickoff_at, competition")
      .eq("id", data.fixtureId)
      .maybeSingle();
    if (fxErr) throw new Error(fxErr.message);
    if (!fx) throw new Error("Fixture not found");
    // LOCKED: league-only game — cup ties must never be predictable.
    if (((fx as any).competition ?? "") !== "Championship") {
      throw new Error("Score predictions are for Championship fixtures only.");
    }
    if (new Date((fx as any).kickoff_at).getTime() - 30 * 60 * 1000 <= Date.now()) {
      throw new Error("Predictions lock 30 minutes before kick-off — this fixture is closed.");
    }

    const { error } = await supabase
      .from("boro_predictions")
      .upsert(
        {
          user_id: userId,
          fixture_id: data.fixtureId,
          home_pred: data.homePred,
          away_pred: data.awayPred,
        },
        { onConflict: "user_id,fixture_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBoroLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BoroLeaderboardRowDTO[]> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("boro_leaderboard")
      .select("*")
      .order("total_points", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const isAdmin = await isAdminOrManagement(context.supabase, context.userId);
    const emailMap = new Map<string, string>();
    if (isAdmin) {
      const userIds = new Set(rows.filter((r) => !r.is_guest).map((r) => r.user_id as string));
      const guestIds = rows.filter((r) => r.is_guest).map((r) => r.user_id as string);
      if (userIds.size) {
        for (let page = 1; page < 20; page++) {
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
          const users = list?.users ?? [];
          for (const u of users) if (userIds.has(u.id) && u.email) emailMap.set(u.id, u.email);
          if (users.length < 1000) break;
        }
      }
      if (guestIds.length) {
        const { data: gs } = await supabaseAdmin
          .from("boro_guest_entrants")
          .select("id, email")
          .in("id", guestIds);
        for (const g of gs ?? []) if ((g as any).email) emailMap.set((g as any).id, (g as any).email);
      }
    }
    return rows.map((r: any) => ({
      userId: r.user_id,
      displayName: r.display_name,
      username: r.username,
      avatarUrl: r.avatar_url,
      isGuest: !!r.is_guest,
      totalPoints: r.total_points ?? 0,
      exactCount: r.exact_count ?? 0,
      goalDiffCount: r.goal_diff_count ?? 0,
      resultCount: r.result_count ?? 0,
      predictionsMade: r.predictions_made ?? 0,
      predictionsScored: r.predictions_scored ?? 0,
      email: emailMap.get(r.user_id) ?? null,
    }));
  });

export type BoroEntrantPickDTO = {
  fixtureId: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  homePred: number;
  awayPred: number;
  points: number | null;
};

export const getEntrantBoroPredictions = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z.object({ entrantId: z.string().uuid(), isGuest: z.boolean() }).parse(d),
  )
  .handler(async ({ data }): Promise<BoroEntrantPickDTO[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const col = data.isGuest ? "guest_id" : "user_id";
    const { data: rows, error } = await supabaseAdmin
      .from("boro_predictions")
      .select(
        "home_pred, away_pred, points, fixture:boro_fixtures!inner(id, competition, home_team, away_team, kickoff_at, home_score, away_score, status)",
      )
      .eq(col, data.entrantId)
      .eq("fixture.competition", "Championship")
      .lte("fixture.kickoff_at", nowIso);
    if (error) throw new Error(error.message);
    return (rows ?? [])
      .map((r: any) => ({
        fixtureId: r.fixture.id,
        competition: r.fixture.competition ?? "Championship",
        homeTeam: r.fixture.home_team,
        awayTeam: r.fixture.away_team,
        kickoffAt: r.fixture.kickoff_at,
        homeScore: r.fixture.home_score,
        awayScore: r.fixture.away_score,
        status: r.fixture.status,
        homePred: r.home_pred,
        awayPred: r.away_pred,
        points: r.points,
      }))
      .sort((a, b) => +new Date(b.kickoffAt) - +new Date(a.kickoffAt));
  });

const fixtureSchema = z.object({
  id: z.string().uuid().optional(),
  competition: z.string().min(1).max(80),
  homeTeam: z.string().min(1).max(80),
  awayTeam: z.string().min(1).max(80),
  kickoffAt: z.string().min(1),
  venue: z.string().max(120).nullable().optional(),
});

export const adminUpsertBoroFixture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => fixtureSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdminOrManagement(supabase, userId))) throw new Error("Forbidden");
    const payload = {
      competition: data.competition,
      home_team: data.homeTeam,
      away_team: data.awayTeam,
      kickoff_at: data.kickoffAt,
      venue: data.venue ?? null,
    };
    if (data.id) {
      const { error } = await supabase.from("boro_fixtures").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabase
      .from("boro_fixtures")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as any).id };
  });

export const adminDeleteBoroFixture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdminOrManagement(supabase, userId))) throw new Error("Forbidden");
    const { error } = await supabase.from("boro_fixtures").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const resultSchema = z.object({
  fixtureId: z.string().uuid(),
  homeScore: z.number().int().min(0).max(99).nullable(),
  awayScore: z.number().int().min(0).max(99).nullable(),
});

export const adminSetBoroResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => resultSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdminOrManagement(supabase, userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("boro_fixtures")
      .update({
        home_score: data.homeScore,
        away_score: data.awayScore,
        status: data.homeScore !== null && data.awayScore !== null ? "FINISHED" : "SCHEDULED",
      })
      .eq("id", data.fixtureId);
    if (upErr) throw new Error(upErr.message);
    const { error: scoreErr } = await supabaseAdmin.rpc("boro_score_fixture" as never, {
      _fixture_id: data.fixtureId,
    } as never);
    if (scoreErr) throw new Error(scoreErr.message);
    return { ok: true };
  });

export const adminDeleteBoroEntrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ entrantId: z.string().uuid(), isGuest: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdminOrManagement(supabase, userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.isGuest) {
      const { error: pErr } = await supabaseAdmin
        .from("boro_predictions")
        .delete()
        .eq("guest_id", data.entrantId);
      if (pErr) throw new Error(pErr.message);
      const { error: eErr } = await supabaseAdmin
        .from("boro_guest_entrants")
        .delete()
        .eq("id", data.entrantId);
      if (eErr) throw new Error(eErr.message);
    } else {
      const { error: pErr } = await supabaseAdmin
        .from("boro_predictions")
        .delete()
        .eq("user_id", data.entrantId);
      if (pErr) throw new Error(pErr.message);
      const { error: eErr } = await supabaseAdmin
        .from("boro_entrants")
        .delete()
        .eq("user_id", data.entrantId);
      if (eErr) throw new Error(eErr.message);
    }
    return { ok: true };
  });