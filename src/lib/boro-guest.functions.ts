import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const emailSchema = z.string().trim().toLowerCase().email().max(255);
const pinSchema = z.string().regex(/^\d{4}$/, "PIN must be 4 digits");

function hashPin(pin: string, salt: string) {
  return scryptSync(pin, salt, 32).toString("hex");
}
function verifyPin(pin: string, salt: string, hash: string) {
  const computed = Buffer.from(hashPin(pin, salt), "hex");
  const target = Buffer.from(hash, "hex");
  return computed.length === target.length && timingSafeEqual(computed, target);
}
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function authenticateGuest(email: string, pin: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("boro_guest_entrants")
    .select("id, pin_salt, pin_hash, display_name, email")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No guest account found for that email.");
  if (!verifyPin(pin, (data as any).pin_salt, (data as any).pin_hash)) {
    throw new Error("Incorrect PIN.");
  }
  return data as { id: string; pin_salt: string; pin_hash: string; display_name: string; email: string };
}

const signInSchema = z.object({
  email: emailSchema,
  pin: pinSchema,
  displayName: z.string().trim().min(1).max(40),
});
const signInExistingSchema = z.object({ email: emailSchema, pin: pinSchema });

export const boroGuestSignInExisting = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => signInExistingSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: existing, error: selErr } = await admin
      .from("boro_guest_entrants")
      .select("id, pin_salt, pin_hash, display_name")
      .eq("email", data.email)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!existing) throw new Error("No guest account found for that email. Please register first.");
    if (!verifyPin(data.pin, (existing as any).pin_salt, (existing as any).pin_hash)) {
      throw new Error("Incorrect PIN for this email.");
    }
    return {
      guestId: (existing as any).id as string,
      displayName: (existing as any).display_name as string,
    };
  });

export const boroGuestSignInOrRegister = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => signInSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: existing, error: selErr } = await admin
      .from("boro_guest_entrants")
      .select("id, pin_salt, pin_hash, display_name")
      .eq("email", data.email)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (existing) {
      if (!verifyPin(data.pin, (existing as any).pin_salt, (existing as any).pin_hash)) {
        throw new Error("Incorrect PIN for this email.");
      }
      if ((existing as any).display_name !== data.displayName) {
        await admin
          .from("boro_guest_entrants")
          .update({ display_name: data.displayName })
          .eq("id", (existing as any).id);
      }
      return { guestId: (existing as any).id as string, displayName: data.displayName };
    }
    const salt = randomBytes(16).toString("hex");
    const hash = hashPin(data.pin, salt);
    const { data: ins, error: insErr } = await admin
      .from("boro_guest_entrants")
      .insert({
        email: data.email,
        display_name: data.displayName,
        pin_salt: salt,
        pin_hash: hash,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    const { registerEmailList, EMAIL_LIST_COMPETITIONS } = await import("@/lib/email-lists");
    await registerEmailList(admin as never, data.email, EMAIL_LIST_COMPETITIONS, "boro_guest_entrants");
    return { guestId: (ins as any).id as string, displayName: data.displayName };
  });

const listSchema = z.object({
  email: emailSchema.optional(),
  pin: pinSchema.optional(),
});

export type PublicBoroFixture = {
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

export const listBoroFixturesPublic = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<PublicBoroFixture[]> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const admin = await getAdmin();
    const { data: fixtures, error } = await admin
      .from("boro_fixtures")
      .select("id, competition, home_team, away_team, kickoff_at, venue, home_score, away_score, status, minute, minute_added, month_key, home_reds, away_reds")
      // LOCKED: Boro score predictions are Championship (league) fixtures only.
      // Never widen this filter to include cup ties.
      .eq("competition", "Championship")
      .order("kickoff_at", { ascending: true });
    if (error) throw new Error(error.message);

    const predMap = new Map<string, { home_pred: number; away_pred: number; points: number | null }>();
    if (data.email && data.pin) {
      try {
        const g = await authenticateGuest(data.email, data.pin);
        const { data: preds } = await admin
          .from("boro_predictions")
          .select("fixture_id, home_pred, away_pred, points")
          .eq("guest_id", g.id);
        for (const p of preds ?? []) predMap.set((p as any).fixture_id, p as any);
      } catch { /* ignore */ }
    }

    return (fixtures ?? []).map((f: any) => {
      const p = predMap.get(f.id);
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
        myPrediction: p
          ? { homePred: p.home_pred, awayPred: p.away_pred, points: p.points ?? null }
          : null,
      };
    });
  });

const upsertSchema = z.object({
  email: emailSchema,
  pin: pinSchema,
  fixtureId: z.string().uuid(),
  homePred: z.number().int().min(0).max(30),
  awayPred: z.number().int().min(0).max(30),
});

export const upsertBoroGuestPrediction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data }) => {
    const g = await authenticateGuest(data.email, data.pin);
    const admin = await getAdmin();
    const { data: fx, error: fxErr } = await admin
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
    const { error } = await admin
      .from("boro_predictions")
      .upsert(
        {
          guest_id: g.id,
          fixture_id: data.fixtureId,
          home_pred: data.homePred,
          away_pred: data.awayPred,
        },
        { onConflict: "guest_id,fixture_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PublicBoroLeaderboardRow = {
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
};

export const getBoroLeaderboardPublic = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicBoroLeaderboardRow[]> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("boro_leaderboard")
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
      predictionsMade: r.predictions_made ?? 0,
      predictionsScored: r.predictions_scored ?? 0,
    }));
  },
);

const requestResetSchema = z.object({ email: emailSchema });

export const requestBoroGuestPinReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => requestResetSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: entrant } = await admin
      .from("boro_guest_entrants")
      .select("id, display_name, email")
      .eq("email", data.email)
      .maybeSingle();
    if (!entrant) return { ok: true };

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeSalt = randomBytes(8).toString("hex");
    const codeHash = `${codeSalt}:${hashPin(code, codeSalt)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { error: updErr } = await admin
      .from("boro_guest_entrants")
      .update({ pin_reset_hash: codeHash, pin_reset_expires_at: expiresAt })
      .eq("id", (entrant as any).id);
    if (updErr) throw new Error(updErr.message);

    try {
      const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
      // Re-use the WC PIN reset template — same wording works for either game.
      await sendAndLogEmail(admin, "wc-guest-pin-reset", (entrant as any).email, {
        templateData: {
          displayName: (entrant as any).display_name,
          code,
          expiresMinutes: 30,
        },
        idempotencyKey: `boro-guest-pin-reset-${(entrant as any).id}-${Date.now()}`,
      });
    } catch (e) {
      console.error("Failed to send PIN reset email", e);
      throw new Error("Failed to send reset email — please try again.");
    }
    return { ok: true };
  });

const resetSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, "Reset code must be 6 digits"),
  newPin: pinSchema,
});

export const resetBoroGuestPin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => resetSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: entrant, error } = await admin
      .from("boro_guest_entrants")
      .select("id, display_name, pin_reset_hash, pin_reset_expires_at")
      .eq("email", data.email)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!entrant || !(entrant as any).pin_reset_hash || !(entrant as any).pin_reset_expires_at) {
      throw new Error("No reset request found. Please request a new code.");
    }
    if (new Date((entrant as any).pin_reset_expires_at).getTime() < Date.now()) {
      throw new Error("Reset code has expired. Please request a new one.");
    }
    const stored: string = (entrant as any).pin_reset_hash;
    const [codeSalt, codeHash] = stored.split(":");
    if (!codeSalt || !codeHash) throw new Error("Invalid reset state.");
    const computed = Buffer.from(hashPin(data.code, codeSalt), "hex");
    const target = Buffer.from(codeHash, "hex");
    if (computed.length !== target.length || !timingSafeEqual(computed, target)) {
      throw new Error("Incorrect reset code.");
    }
    const salt = randomBytes(16).toString("hex");
    const hash = hashPin(data.newPin, salt);
    const { error: upErr } = await admin
      .from("boro_guest_entrants")
      .update({
        pin_salt: salt,
        pin_hash: hash,
        pin_reset_hash: null,
        pin_reset_expires_at: null,
      })
      .eq("id", (entrant as any).id);
    if (upErr) throw new Error(upErr.message);
    return {
      ok: true,
      guestId: (entrant as any).id as string,
      displayName: (entrant as any).display_name as string,
    };
  });