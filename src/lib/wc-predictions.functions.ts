import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WcStage = "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final";

export type WcFixtureDTO = {
  id: string;
  stage: WcStage;
  groupLabel: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  homeScore: number | null;
  awayScore: number | null;
  myPrediction: { homePred: number; awayPred: number; points: number | null } | null;
};

export type WcLeaderboardRowDTO = {
  userId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  totalPoints: number;
  exactCount: number;
  resultCount: number;
  predictionsMade: number;
  predictionsScored: number;
};

const ROLES_ALLOWED_TO_PREDICT = ["subscriber", "member"];

async function isAdminOrManagement(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const rs = new Set((data ?? []).map((r: any) => r.role));
  return rs.has("admin") || rs.has("management");
}

async function userCanPredict(supabase: any, userId: string) {
  const { data } = await supabase
    .from("wc_entrants")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

// ------------------------------------------------------------------
// Free opt-in: join / leave / status
// ------------------------------------------------------------------
export const getWcEntrantStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ joined: boolean }> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("wc_entrants")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { joined: !!data };
  });

export const joinWcPredictor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("wc_entrants")
      .upsert({ user_id: userId }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------------------------------------------------------
// User: list fixtures with my prediction merged in
// ------------------------------------------------------------------
export const listWcFixtures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WcFixtureDTO[]> => {
    const { supabase, userId } = context;
    const [{ data: fixtures, error: fxErr }, { data: preds, error: prErr }] = await Promise.all([
      supabase
        .from("wc_fixtures")
        .select("id, stage, group_label, home_team, away_team, kickoff_at, home_score, away_score")
        .order("kickoff_at", { ascending: true }),
      supabase
        .from("wc_predictions")
        .select("fixture_id, home_pred, away_pred, points")
        .eq("user_id", userId),
    ]);
    if (fxErr) throw new Error(fxErr.message);
    if (prErr) throw new Error(prErr.message);
    const predMap = new Map<string, { home_pred: number; away_pred: number; points: number | null }>();
    for (const p of preds ?? []) predMap.set((p as any).fixture_id, p as any);
    return (fixtures ?? []).map((f: any) => {
      const p = predMap.get(f.id);
      return {
        id: f.id,
        stage: f.stage,
        groupLabel: f.group_label,
        homeTeam: f.home_team,
        awayTeam: f.away_team,
        kickoffAt: f.kickoff_at,
        homeScore: f.home_score,
        awayScore: f.away_score,
        myPrediction: p
          ? { homePred: p.home_pred, awayPred: p.away_pred, points: p.points ?? null }
          : null,
      };
    });
  });

// ------------------------------------------------------------------
// User: upsert a prediction (server validates kickoff & role)
// ------------------------------------------------------------------
const upsertSchema = z.object({
  fixtureId: z.string().uuid(),
  homePred: z.number().int().min(0).max(30),
  awayPred: z.number().int().min(0).max(30),
});

export const upsertWcPrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const canPredict = await userCanPredict(supabase, userId);
    if (!canPredict) {
      throw new Error("Only subscribers can enter predictions.");
    }

    const { data: fx, error: fxErr } = await supabase
      .from("wc_fixtures")
      .select("id, kickoff_at")
      .eq("id", data.fixtureId)
      .maybeSingle();
    if (fxErr) throw new Error(fxErr.message);
    if (!fx) throw new Error("Fixture not found");
    if (new Date((fx as any).kickoff_at).getTime() - 30 * 60 * 1000 <= Date.now()) {
      throw new Error("Predictions lock 30 minutes before kick-off — this fixture is closed.");
    }

    const { error } = await supabase
      .from("wc_predictions")
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

// ------------------------------------------------------------------
// Leaderboard
// ------------------------------------------------------------------
export const getWcLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WcLeaderboardRowDTO[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("wc_leaderboard")
      .select("*")
      .order("total_points", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      userId: r.user_id,
      displayName: r.display_name,
      username: r.username,
      avatarUrl: r.avatar_url,
      isGuest: !!r.is_guest,
      totalPoints: r.total_points ?? 0,
      exactCount: r.exact_count ?? 0,
      resultCount: r.result_count ?? 0,
      predictionsMade: r.predictions_made ?? 0,
      predictionsScored: r.predictions_scored ?? 0,
    }));
  });

// ------------------------------------------------------------------
// Admin: upsert / delete a fixture
// ------------------------------------------------------------------
const fixtureSchema = z.object({
  id: z.string().uuid().optional(),
  stage: z.enum(["group", "r32", "r16", "qf", "sf", "third", "final"]),
  groupLabel: z.string().max(8).nullable().optional(),
  homeTeam: z.string().min(1).max(80),
  awayTeam: z.string().min(1).max(80),
  kickoffAt: z.string().min(1),
});

export const adminUpsertWcFixture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => fixtureSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdminOrManagement(supabase, userId))) throw new Error("Forbidden");
    const payload = {
      stage: data.stage,
      group_label: data.groupLabel ?? null,
      home_team: data.homeTeam,
      away_team: data.awayTeam,
      kickoff_at: data.kickoffAt,
    };
    if (data.id) {
      const { error } = await supabase.from("wc_fixtures").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabase
      .from("wc_fixtures")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as any).id };
  });

export const adminDeleteWcFixture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdminOrManagement(supabase, userId))) throw new Error("Forbidden");
    const { error } = await supabase.from("wc_fixtures").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------------------------------------------------------
// Admin: set final score → recompute points
// ------------------------------------------------------------------
const resultSchema = z.object({
  fixtureId: z.string().uuid(),
  homeScore: z.number().int().min(0).max(99).nullable(),
  awayScore: z.number().int().min(0).max(99).nullable(),
});

export const adminSetWcResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => resultSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdminOrManagement(supabase, userId))) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("wc_fixtures")
      .update({ home_score: data.homeScore, away_score: data.awayScore })
      .eq("id", data.fixtureId);
    if (upErr) throw new Error(upErr.message);

    const { error: scoreErr } = await supabaseAdmin.rpc("wc_score_fixture" as never, {
      _fixture_id: data.fixtureId,
    } as never);
    if (scoreErr) throw new Error(scoreErr.message);
    return { ok: true };
  });

// Recompute all (safety net)
export const adminRescoreAllWc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await isAdminOrManagement(supabase, userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: fixtures, error } = await supabaseAdmin
      .from("wc_fixtures")
      .select("id")
      .not("home_score", "is", null)
      .not("away_score", "is", null);
    if (error) throw new Error(error.message);
    for (const f of fixtures ?? []) {
      await supabaseAdmin.rpc("wc_score_fixture" as never, { _fixture_id: (f as any).id } as never);
    }
    return { ok: true, count: (fixtures ?? []).length };
  });