import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { emailSchema, pinSchema } from "@/lib/fantasy-guest-schemas";
import type { FantasyLeaderboardRow, FantasyPreviousGwScoreDTO, FantasyStateDTO } from "@/lib/fantasy.server";
import type { FantasySwapHistoryRow } from "@/lib/fantasy-swap-history.server";

// ------------------------------------------------------------------
// Register / sign in
// ------------------------------------------------------------------
export const fantasyGuestSignInExisting = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: emailSchema, pin: pinSchema }).parse(d))
  .handler(async ({ data }) => {
    const { getAdmin, authenticateGuest, hashPin, verifyPin, makeSalt } = await import("@/lib/fantasy-guest-auth.server");
    const g = await authenticateGuest(data.email, data.pin);
    return {
      guestId: g.id as string,
      displayName: g.display_name as string,
      teamName: (g.team_name ?? null) as string | null,
    };
  });

export const fantasyGuestRegister = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: emailSchema,
        pin: pinSchema,
        displayName: z.string().trim().min(1).max(40),
        teamName: z.string().trim().min(1).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getAdmin, authenticateGuest, hashPin, verifyPin, makeSalt } = await import("@/lib/fantasy-guest-auth.server");
    const admin = await getAdmin();
    const { data: existing, error: selErr } = await admin
      .from("fantasy_guest_entrants")
      .select("id, pin_salt, pin_hash")
      .eq("email", data.email)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (existing) {
      if (!verifyPin(data.pin, (existing as any).pin_salt, (existing as any).pin_hash)) {
        throw new Error("That email is already registered — enter the correct PIN to sign in.");
      }
      await admin
        .from("fantasy_guest_entrants")
        .update({ display_name: data.displayName, team_name: data.teamName })
        .eq("id", (existing as any).id);
      return {
        guestId: (existing as any).id as string,
        displayName: data.displayName,
        teamName: data.teamName,
      };
    }
    const salt = makeSalt();
    const hash = hashPin(data.pin, salt);
    const { data: ins, error: insErr } = await admin
      .from("fantasy_guest_entrants")
      .insert({
        email: data.email,
        display_name: data.displayName,
        team_name: data.teamName,
        pin_salt: salt,
        pin_hash: hash,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    const { registerEmailList, EMAIL_LIST_COMPETITIONS } = await import("@/lib/email-lists");
    await registerEmailList(admin as never, data.email, EMAIL_LIST_COMPETITIONS, "fantasy_guest_entrants");
    return {
      guestId: (ins as any).id as string,
      displayName: data.displayName,
      teamName: data.teamName,
    };
  });

// ------------------------------------------------------------------
// Public reads (guest or anonymous browsing)
// ------------------------------------------------------------------
export const getPublicFantasyState = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ email: emailSchema.optional(), pin: pinSchema.optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<FantasyStateDTO> => {
    const { getAdmin, authenticateGuest, hashPin, verifyPin, makeSalt } = await import("@/lib/fantasy-guest-auth.server");
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { loadState } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    let owner: { guestId: string } | null = null;
    if (data.email && data.pin) {
      const g = await authenticateGuest(data.email, data.pin);
      owner = { guestId: g.id as string };
    }
    return loadState(admin, owner);
  });

export const getPublicFantasyLeaderboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<FantasyLeaderboardRow[]> => {
    const { getAdmin, authenticateGuest, hashPin, verifyPin, makeSalt } = await import("@/lib/fantasy-guest-auth.server");
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { loadLeaderboard } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    return loadLeaderboard(admin, false);
  },
);

export const getPublicFantasyPreviousGameweekScores = createServerFn({ method: "GET" }).handler(
  async (): Promise<FantasyPreviousGwScoreDTO | null> => {
    const { getAdmin, authenticateGuest, hashPin, verifyPin, makeSalt } = await import("@/lib/fantasy-guest-auth.server");
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { loadPreviousGameweekScores } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    return loadPreviousGameweekScores(admin);
  },
);

/** Swap history for a guest manager (email + PIN identifies the entrant). */
export const getGuestFantasySwapHistory = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ email: emailSchema, pin: pinSchema }).parse(d))
  .handler(async ({ data }): Promise<FantasySwapHistoryRow[]> => {
    const { getAdmin, authenticateGuest, hashPin, verifyPin, makeSalt } = await import("@/lib/fantasy-guest-auth.server");
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { loadSwapHistory } = await import("@/lib/fantasy-swap-history.server");
    const admin = await getAdmin();
    const g = await authenticateGuest(data.email, data.pin);
    return loadSwapHistory(admin, { guestId: g.id as string });
  });

// ------------------------------------------------------------------
// Guest writes
// ------------------------------------------------------------------
export const saveGuestFantasySquad = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: emailSchema,
        pin: pinSchema,
        gameweekId: z.string().uuid(),
        formation: z.string().min(3).max(8),
        starters: z.array(z.string().uuid()).length(11),
        // saveSquad validates the exact bench size from the gameweek's
        // competition; keeping a second fixed limit here caused stale errors.
        bench: z.array(z.string().uuid()),
        captainId: z.string().uuid(),
        viceId: z.string().uuid(),
        starterPositions: z.array(z.enum(["gk", "def", "mid", "fwd"]).nullable()).length(11).optional(),
        benchPositions: z.array(z.enum(["gk", "def", "mid", "fwd"]).nullable()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getAdmin, authenticateGuest, hashPin, verifyPin, makeSalt } = await import("@/lib/fantasy-guest-auth.server");
    const { saveSquad } = await import("@/lib/fantasy.server");
    const admin = await getAdmin();
    const g = await authenticateGuest(data.email, data.pin);
    return saveSquad(admin, { guestId: g.id as string }, {
      gameweekId: data.gameweekId,
      formation: data.formation,
      starters: data.starters,
      bench: data.bench,
      captainId: data.captainId,
      viceId: data.viceId,
      starterPositions: data.starterPositions,
      benchPositions: data.benchPositions,
    });
  });

export const setGuestFantasyTeamName = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ email: emailSchema, pin: pinSchema, teamName: z.string().trim().min(1).max(40) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getAdmin, authenticateGuest, hashPin, verifyPin, makeSalt } = await import("@/lib/fantasy-guest-auth.server");
    const admin = await getAdmin();
    const g = await authenticateGuest(data.email, data.pin);
    const { error } = await admin
      .from("fantasy_guest_entrants")
      .update({ team_name: data.teamName })
      .eq("id", g.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------------------------------------------------------
// PIN reset (same flow as the predictor games)
// ------------------------------------------------------------------
export const requestFantasyGuestPinReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: emailSchema }).parse(d))
  .handler(async ({ data }) => {
    const { getAdmin, authenticateGuest, hashPin, verifyPin, makeSalt } = await import("@/lib/fantasy-guest-auth.server");
    const admin = await getAdmin();
    const { data: entrant } = await admin
      .from("fantasy_guest_entrants")
      .select("id, display_name, email")
      .eq("email", data.email)
      .maybeSingle();
    if (!entrant) return { ok: true };

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeSalt = makeSalt(8);
    const codeHash = `${codeSalt}:${hashPin(code, codeSalt)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { error: updErr } = await admin
      .from("fantasy_guest_entrants")
      .update({ pin_reset_hash: codeHash, pin_reset_expires_at: expiresAt })
      .eq("id", (entrant as any).id);
    if (updErr) throw new Error(updErr.message);

    try {
      const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
      await sendAndLogEmail(admin, "wc-guest-pin-reset", (entrant as any).email, {
        templateData: {
          displayName: (entrant as any).display_name,
          code,
          expiresMinutes: 30,
        },
        idempotencyKey: `fantasy-guest-pin-reset-${(entrant as any).id}-${Date.now()}`,
      });
    } catch (e) {
      console.error("Failed to send fantasy PIN reset email", e);
      throw new Error("Failed to send reset email — please try again.");
    }
    return { ok: true };
  });

export const resetFantasyGuestPin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: emailSchema,
        code: z.string().regex(/^\d{6}$/, "Reset code must be 6 digits"),
        newPin: pinSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getAdmin, authenticateGuest, hashPin, verifyPin, makeSalt } = await import("@/lib/fantasy-guest-auth.server");
    const admin = await getAdmin();
    const { data: entrant, error } = await admin
      .from("fantasy_guest_entrants")
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
    const [codeSalt, codeHash] = ((entrant as any).pin_reset_hash as string).split(":");
    if (!codeSalt || !codeHash) throw new Error("Invalid reset state.");
    if (!verifyPin(data.code, codeSalt, codeHash)) {
      throw new Error("Incorrect reset code.");
    }
    const salt = makeSalt();
    const hash = hashPin(data.newPin, salt);
    const { error: upErr } = await admin
      .from("fantasy_guest_entrants")
      .update({ pin_salt: salt, pin_hash: hash, pin_reset_hash: null, pin_reset_expires_at: null })
      .eq("id", (entrant as any).id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, guestId: (entrant as any).id as string };
  });
