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
    .from("wc_guest_entrants")
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

// --------------------------------------------------------------------
// Sign in (or register) as guest
// --------------------------------------------------------------------
const signInSchema = z.object({
  email: emailSchema,
  pin: pinSchema,
  displayName: z.string().trim().min(1).max(40),
});

const signInExistingSchema = z.object({
  email: emailSchema,
  pin: pinSchema,
});

export const guestSignInExisting = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => signInExistingSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: existing, error: selErr } = await admin
      .from("wc_guest_entrants")
      .select("id, pin_salt, pin_hash, display_name")
      .eq("email", data.email)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!existing) {
      throw new Error("No guest account found for that email. Please register first.");
    }
    if (!verifyPin(data.pin, (existing as any).pin_salt, (existing as any).pin_hash)) {
      throw new Error("Incorrect PIN for this email.");
    }
    return {
      guestId: (existing as any).id as string,
      displayName: (existing as any).display_name as string,
    };
  });

export const guestSignInOrRegister = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => signInSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: existing, error: selErr } = await admin
      .from("wc_guest_entrants")
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
          .from("wc_guest_entrants")
          .update({ display_name: data.displayName })
          .eq("id", (existing as any).id);
      }
      return { guestId: (existing as any).id as string, displayName: data.displayName };
    }

    const salt = randomBytes(16).toString("hex");
    const hash = hashPin(data.pin, salt);
    const { data: ins, error: insErr } = await admin
      .from("wc_guest_entrants")
      .insert({
        email: data.email,
        display_name: data.displayName,
        pin_salt: salt,
        pin_hash: hash,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { guestId: (ins as any).id as string, displayName: data.displayName };
  });

// --------------------------------------------------------------------
// Public fixtures list (with optional guest predictions merged in)
// --------------------------------------------------------------------
const listSchema = z.object({
  email: emailSchema.optional(),
  pin: pinSchema.optional(),
});

export type PublicWcFixture = {
  id: string;
  stage: "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final";
  groupLabel: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  minute: number | null;
  myPrediction: { homePred: number; awayPred: number; points: number | null } | null;
};

export const listWcFixturesPublic = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<PublicWcFixture[]> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const admin = await getAdmin();
    const { data: fixtures, error } = await admin
      .from("wc_fixtures")
      .select("id, stage, group_label, home_team, away_team, kickoff_at, home_score, away_score, status, minute")
      .order("kickoff_at", { ascending: true });
    if (error) throw new Error(error.message);

    const predMap = new Map<string, { home_pred: number; away_pred: number; points: number | null }>();
    if (data.email && data.pin) {
      try {
        const g = await authenticateGuest(data.email, data.pin);
        const { data: preds } = await admin
          .from("wc_predictions")
          .select("fixture_id, home_pred, away_pred, points")
          .eq("guest_id", g.id);
        for (const p of preds ?? []) predMap.set((p as any).fixture_id, p as any);
      } catch {
        /* silently fall back to no picks */
      }
    }

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
        status: (f.status as string | null) ?? "SCHEDULED",
        minute: (f.minute as number | null) ?? null,
        myPrediction: p
          ? { homePred: p.home_pred, awayPred: p.away_pred, points: p.points ?? null }
          : null,
      };
    });
  });

// --------------------------------------------------------------------
// Guest upsert
// --------------------------------------------------------------------
const upsertSchema = z.object({
  email: emailSchema,
  pin: pinSchema,
  fixtureId: z.string().uuid(),
  homePred: z.number().int().min(0).max(30),
  awayPred: z.number().int().min(0).max(30),
});

export const upsertWcGuestPrediction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data }) => {
    const g = await authenticateGuest(data.email, data.pin);
    const admin = await getAdmin();
    const { data: fx, error: fxErr } = await admin
      .from("wc_fixtures")
      .select("id, kickoff_at")
      .eq("id", data.fixtureId)
      .maybeSingle();
    if (fxErr) throw new Error(fxErr.message);
    if (!fx) throw new Error("Fixture not found");
    if (new Date((fx as any).kickoff_at).getTime() - 30 * 60 * 1000 <= Date.now()) {
      throw new Error("Predictions lock 30 minutes before kick-off — this fixture is closed.");
    }
    const { error } = await admin
      .from("wc_predictions")
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

// --------------------------------------------------------------------
// Public leaderboard (users + guests merged)
// --------------------------------------------------------------------
export type PublicLeaderboardRow = {
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

export const getWcLeaderboardPublic = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicLeaderboardRow[]> => {
    const admin = await getAdmin();
    const { data, error } = await admin
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
      predictionsMade: r.predictions_made ?? 0,
      predictionsScored: r.predictions_scored ?? 0,
    }));
  },
);

// --------------------------------------------------------------------
// Guest PIN reset — request a code by email
// --------------------------------------------------------------------
const requestResetSchema = z.object({ email: emailSchema });

export const requestGuestPinReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => requestResetSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: entrant } = await admin
      .from("wc_guest_entrants")
      .select("id, display_name, email")
      .eq("email", data.email)
      .maybeSingle();

    // Always behave the same to avoid email enumeration.
    if (!entrant) {
      return { ok: true };
    }

    // 6-digit code, valid 30 min. Store only a hash.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeSalt = randomBytes(8).toString("hex");
    const codeHash = `${codeSalt}:${hashPin(code, codeSalt)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { error: updErr } = await admin
      .from("wc_guest_entrants")
      .update({ pin_reset_hash: codeHash, pin_reset_expires_at: expiresAt })
      .eq("id", (entrant as any).id);
    if (updErr) throw new Error(updErr.message);

    // Render & enqueue the email directly via admin client.
    try {
      const React = await import("react");
      const { render } = await import("@react-email/render");
      const { template } = await import("@/lib/email-templates/wc-guest-pin-reset");

      const element = React.createElement(template.component, {
        displayName: (entrant as any).display_name,
        code,
        expiresMinutes: 30,
      });
      const html = await render(element);
      const text = await render(element, { plainText: true });

      const subject =
        typeof template.subject === "function"
          ? (template.subject as (d: any) => string)({ code })
          : template.subject;

      const messageId = crypto.randomUUID();
      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "wc-guest-pin-reset",
        recipient_email: (entrant as any).email,
        status: "pending",
      });

      await admin.rpc("enqueue_email" as never, {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: (entrant as any).email,
          from: "BM Support <noreply@bmsupport.uk>",
          sender_domain: "notify.bmsupport.uk",
          subject,
          html,
          text,
          purpose: "transactional",
          label: "wc-guest-pin-reset",
          idempotency_key: messageId,
          queued_at: new Date().toISOString(),
        },
      } as never);
    } catch (e) {
      console.error("Failed to enqueue PIN reset email", e);
      throw new Error("Failed to send reset email — please try again.");
    }

    return { ok: true };
  });

// --------------------------------------------------------------------
// Guest PIN reset — verify code and set new PIN
// --------------------------------------------------------------------
const resetSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, "Reset code must be 6 digits"),
  newPin: pinSchema,
});

export const resetGuestPin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => resetSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: entrant, error } = await admin
      .from("wc_guest_entrants")
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
      .from("wc_guest_entrants")
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