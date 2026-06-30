import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WcLiveFixtureRow } from "@/lib/wc-live-scores.server";

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
  status: string;
  minute: number | null;
  minuteAdded: number | null;
  homeReds: number;
  awayReds: number;
  penWinner: "home" | "away" | null;
  homePens: number | null;
  awayPens: number | null;
  livePhase: "ET" | "PENS" | null;
  myPrediction: {
    homePred: number;
    awayPred: number;
    points: number | null;
    penWinnerPred: "home" | "away" | null;
  } | null;
};

export type WcLeaderboardRowDTO = {
  userId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  totalPoints: number;
  exactCount: number;
  goalDiffCount: number;
  resultCount: number;
  penWinCount: number;
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
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { supabase, userId } = context;
    const [{ data: fixtures, error: fxErr }, { data: preds, error: prErr }] = await Promise.all([
      supabase
        .from("wc_fixtures")
        .select("id, stage, group_label, home_team, away_team, kickoff_at, home_score, away_score, status, minute, minute_added, home_reds, away_reds, pen_winner, home_pens, away_pens")
        .order("kickoff_at", { ascending: true }),
      supabase
        .from("wc_predictions")
        .select("fixture_id, home_pred, away_pred, points, pen_winner_pred")
        .eq("user_id", userId),
    ]);
    if (fxErr) throw new Error(fxErr.message);
    if (prErr) throw new Error(prErr.message);
    const { getWcLiveOverlays, mergeWcLive } = await import("@/lib/wc-live-scores.server");
    const liveOverlays = await getWcLiveOverlays((fixtures ?? []) as WcLiveFixtureRow[]);
    const predMap = new Map<
      string,
      { home_pred: number; away_pred: number; points: number | null; pen_winner_pred: string | null }
    >();
    for (const p of preds ?? []) predMap.set((p as any).fixture_id, p as any);
    return (fixtures ?? []).map((f: any) => {
      const p = predMap.get(f.id);
      const merged = mergeWcLive(f, liveOverlays.get(f.id));
      return {
        id: f.id,
        stage: f.stage,
        groupLabel: f.group_label,
        homeTeam: f.home_team,
        awayTeam: f.away_team,
        kickoffAt: f.kickoff_at,
        homeScore: merged.home_score,
        awayScore: merged.away_score,
        status: merged.status ?? "SCHEDULED",
        minute: merged.minute,
        minuteAdded: merged.minute_added,
        homeReds: merged.home_reds ?? 0,
        awayReds: merged.away_reds ?? 0,
        penWinner: (f.pen_winner ?? null) as "home" | "away" | null,
        homePens: f.home_pens ?? null,
        awayPens: f.away_pens ?? null,
        livePhase: merged.phase ?? null,
        myPrediction: p
          ? {
              homePred: p.home_pred,
              awayPred: p.away_pred,
              points: p.points ?? null,
              penWinnerPred: (p.pen_winner_pred ?? null) as "home" | "away" | null,
            }
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
  penWinnerPred: z.enum(["home", "away"]).nullable().optional(),
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
          // Only meaningful when the predicted scoreline is a draw; ignored otherwise.
          pen_winner_pred:
            data.homePred === data.awayPred ? (data.penWinnerPred ?? null) : null,
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
  .handler(async (): Promise<WcLeaderboardRowDTO[]> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    // Use admin client: the view's security_invoker join to wc_guest_entrants
    // is blocked by RLS for normal users, which would null out guest names.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
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
      goalDiffCount: r.goal_diff_count ?? 0,
      resultCount: r.result_count ?? 0,
      penWinCount: (r as any).pen_win_count ?? 0,
      predictionsMade: r.predictions_made ?? 0,
      predictionsScored: r.predictions_scored ?? 0,
    }));
  });

// ------------------------------------------------------------------
// Public picks: another entrant's predictions (only for fixtures that
// have already kicked off, so you can't copy a live entrant's picks).
// ------------------------------------------------------------------
export type WcEntrantPickDTO = {
  fixtureId: string;
  stage: WcStage;
  groupLabel: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  minute: number | null;
  minuteAdded: number | null;
  homeReds: number;
  awayReds: number;
  homePred: number;
  awayPred: number;
  points: number | null;
  penWinnerPred: "home" | "away" | null;
  penWinner: "home" | "away" | null;
};

export const getEntrantWcPredictions = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z.object({ entrantId: z.string().uuid(), isGuest: z.boolean() }).parse(d),
  )
  .handler(async ({ data }): Promise<WcEntrantPickDTO[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const col = data.isGuest ? "guest_id" : "user_id";
    const { data: rows, error } = await supabaseAdmin
      .from("wc_predictions")
      .select(
        "home_pred, away_pred, points, pen_winner_pred, fixture:wc_fixtures!inner(id, stage, group_label, home_team, away_team, kickoff_at, home_score, away_score, status, minute, minute_added, home_reds, away_reds, pen_winner, home_pens, away_pens)",
      )
      .eq(col, data.entrantId);
    if (error) throw new Error(error.message);
    const fixtures = (rows ?? []).map((r: any) => r.fixture).filter(Boolean) as WcLiveFixtureRow[];
    const { getWcLiveOverlays, mergeWcLive } = await import("@/lib/wc-live-scores.server");
    const liveOverlays = await getWcLiveOverlays(fixtures);
    return (rows ?? [])
      .filter((r: any) => r.fixture && r.fixture.kickoff_at <= nowIso)
      .map((r: any) => {
        const merged = mergeWcLive(r.fixture, liveOverlays.get(r.fixture.id));
        return {
          fixtureId: r.fixture.id,
          stage: r.fixture.stage,
          groupLabel: r.fixture.group_label,
          homeTeam: r.fixture.home_team,
          awayTeam: r.fixture.away_team,
          kickoffAt: r.fixture.kickoff_at,
          homeScore: merged.home_score,
          awayScore: merged.away_score,
          status: merged.status,
          minute: merged.minute,
          minuteAdded: merged.minute_added,
          homeReds: merged.home_reds ?? 0,
          awayReds: merged.away_reds ?? 0,
          homePred: r.home_pred,
          awayPred: r.away_pred,
          points: r.points,
          penWinnerPred: (r.pen_winner_pred ?? null) as "home" | "away" | null,
          penWinner: ((r.fixture as any).pen_winner ?? null) as "home" | "away" | null,
          homePens: (r.fixture as any).home_pens ?? null,
          awayPens: (r.fixture as any).away_pens ?? null,
        };
      })
      .sort((a, b) => +new Date(b.kickoffAt) - +new Date(a.kickoffAt));
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
  penWinner: z.enum(["home", "away"]).nullable().optional(),
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
      .update({
        home_score: data.homeScore,
        away_score: data.awayScore,
        pen_winner: data.penWinner ?? null,
      })
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

// ------------------------------------------------------------------
// Admin: delete an entrant (user or guest) and all their predictions
// ------------------------------------------------------------------
export const adminDeleteWcEntrant = createServerFn({ method: "POST" })
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
        .from("wc_predictions")
        .delete()
        .eq("guest_id", data.entrantId);
      if (pErr) throw new Error(pErr.message);
      const { error: eErr } = await supabaseAdmin
        .from("wc_guest_entrants")
        .delete()
        .eq("id", data.entrantId);
      if (eErr) throw new Error(eErr.message);
    } else {
      const { error: pErr } = await supabaseAdmin
        .from("wc_predictions")
        .delete()
        .eq("user_id", data.entrantId);
      if (pErr) throw new Error(pErr.message);
      const { error: eErr } = await supabaseAdmin
        .from("wc_entrants")
        .delete()
        .eq("user_id", data.entrantId);
      if (eErr) throw new Error(eErr.message);
    }
    return { ok: true };
  });

// ------------------------------------------------------------------
// Settings (prize text + tagline) — stored in app_settings
// ------------------------------------------------------------------
export type WcSettingsDTO = {
  prizeText: string;
  tagline: string;
};

const SETTING_KEYS = ["wc_prize_text", "wc_tagline"] as const;

export const getWcSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WcSettingsDTO> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", SETTING_KEYS as unknown as string[]);
    if (error) throw new Error(error.message);
    const map = new Map<string, unknown>((data ?? []).map((r: any) => [r.key, r.value]));
    const asStr = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      prizeText: asStr(map.get("wc_prize_text")),
      tagline: asStr(map.get("wc_tagline")),
    };
  });

const settingsSchema = z.object({
  prizeText: z.string().max(500),
  tagline: z.string().max(200),
});

export const adminSetWcSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdminOrManagement(supabase, userId))) throw new Error("Forbidden");
    const rows = [
      { key: "wc_prize_text", value: data.prizeText as unknown as object, updated_by: userId },
      { key: "wc_tagline", value: data.tagline as unknown as object, updated_by: userId },
    ];
    const { error } = await supabase
      .from("app_settings")
      .upsert(rows as never, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });