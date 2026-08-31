import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


const CompSchema = z.enum(["wc2026", "boro2026"]);

const COMP_META: Record<"wc2026" | "boro2026", { title: string; winnersUrl: string }> = {
  wc2026: { title: "World Cup 2026 Predictor", winnersUrl: "https://bmsupport.uk/predictions?tab=winners" },
  boro2026: { title: "MFC 2026/27 Predictor", winnersUrl: "https://bmsupport.uk/boro-predictions?tab=winners" },
};

function guestTableForCompetition(competition: "wc2026" | "boro2026") {
  return competition === "wc2026" ? "wc_guest_entrants" : "boro_guest_entrants";
}

async function hashGuestPin(pin: string, salt: string) {
  const { scryptSync } = await import("crypto");
  return scryptSync(pin, salt, 32).toString("hex");
}

async function verifyGuestPin(pin: string, salt: string, hash: string) {
  const { timingSafeEqual } = await import("crypto");
  const computed = Buffer.from(await hashGuestPin(pin, salt), "hex");
  const target = Buffer.from(hash, "hex");
  return computed.length === target.length && timingSafeEqual(computed, target);
}

async function authenticateWinnerGuest(
  supabaseAdmin: any,
  competition: "wc2026" | "boro2026",
  email: string,
  pin: string,
) {
  const { data: guest, error } = await supabaseAdmin
    .from(guestTableForCompetition(competition))
    .select("id, email, display_name, pin_salt, pin_hash")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!guest) throw new Error("No guest account found for that email.");
  if (!(await verifyGuestPin(pin, (guest as any).pin_salt, (guest as any).pin_hash))) {
    throw new Error("Incorrect guest PIN.");
  }
  return guest as { id: string; email: string; display_name: string };
}

async function getWinnerContact(
  supabaseAdmin: any,
  competition: "wc2026" | "boro2026",
  userId: string,
  isGuest: boolean,
): Promise<{ email: string | null; displayName: string }> {
  if (isGuest) {
    const { data: guest } = await supabaseAdmin
      .from(guestTableForCompetition(competition))
      .select("email, display_name")
      .eq("id", userId)
      .maybeSingle();
    return {
      email: (guest as any)?.email ?? null,
      displayName: (guest as any)?.display_name || "Winner",
    };
  }

  const [{ data: u }, { data: prof }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from("profiles").select("display_name, username").eq("id", userId).maybeSingle(),
  ]);

  return {
    email: u?.user?.email ?? null,
    displayName: (prof as any)?.display_name || (prof as any)?.username || "Winner",
  };
}

async function resolveWinnerIsGuest(
  supabaseAdmin: any,
  competition: "wc2026" | "boro2026",
  userId: string,
  isGuestHint?: boolean,
) {
  if (isGuestHint) return true;
  const { data: guest } = await supabaseAdmin
    .from(guestTableForCompetition(competition))
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  return !!guest;
}

async function callerCanManage(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const rs = (roles ?? []).map((r: any) => String(r.role));
  return rs.some((r: string) => r === "admin" || r === "management");
}

function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const announcePredictionWinners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      competition: CompSchema,
      winners: z
        .array(z.object({ userId: z.string().uuid(), place: z.number().int().min(1).max(3), isGuest: z.boolean().optional() }))
        .min(1)
        .max(3),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await callerCanManage(supabase, userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Replace any existing winners for this competition, then insert the new set
    // so re-announcing after a leaderboard change works cleanly.
    for (const w of data.winners) {
      const isGuest = await resolveWinnerIsGuest(supabaseAdmin, data.competition, w.userId, w.isGuest);
      const { error: upErr } = await supabaseAdmin
        .from("prediction_winners")
        .upsert(
          {
            competition: data.competition,
            place: w.place,
            user_id: w.userId,
            is_guest: isGuest,
            notified_at: null,
            confirmed_at: null,
          },
          { onConflict: "competition,place" },
        );
      if (upErr) {
        console.error("prediction_winners upsert failed", { place: w.place, userId: w.userId, err: upErr });
        throw new Error(`Failed to save winner (place ${w.place}): ${upErr.message}`);
      }
    }

    // Fetch the current winners after upsert
    const { data: rows } = await supabaseAdmin
      .from("prediction_winners")
      .select("id, place, user_id, is_guest, notified_at")
      .eq("competition", data.competition)
      .order("place");

    const meta = COMP_META[data.competition];
    let sent = 0;

    for (const row of rows ?? []) {
      if (row.notified_at) continue;
      try {
        const { email, displayName } = await getWinnerContact(
          supabaseAdmin,
          data.competition,
          row.user_id,
          !!row.is_guest,
        );
        if (!email) {
          console.error("winner notification skipped: no email", { place: row.place, userId: row.user_id, isGuest: !!row.is_guest });
          continue;
        }

        const props = { displayName, place: row.place, competitionTitle: meta.title, winnersUrl: meta.winnersUrl };
        const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
        await sendAndLogEmail(supabaseAdmin, "winner-notification", email, {
          templateData: props,
          idempotencyKey: `winner-${data.competition}-${row.user_id}`,
        });
        await supabaseAdmin.from("prediction_winners")
          .update({ notified_at: new Date().toISOString() }).eq("id", row.id);
        sent += 1;
      } catch (e) {
        console.error("winner notification failed", e);
      }
    }

    return { ok: true, sent };
  });

export type PredictionWinnerRow = {
  place: 1 | 2 | 3;
  userId: string;
  isGuest: boolean;
  displayName: string | null;
  confirmed: boolean;
  confirmedAt: string | null;
  notifiedAt: string | null;
  email: string | null;
  isMe: boolean;
  voucherSent: boolean;
  voucherSentAt: string | null;
};

async function readPredictionWinners(
  supabaseAdmin: any,
  competition: "wc2026" | "boro2026",
  canSeeEmails: boolean,
  viewerUserId: string | null,
  viewerGuestId: string | null,
): Promise<PredictionWinnerRow[]> {
  const { data: rows } = await supabaseAdmin
    .from("prediction_winners")
    .select("place, user_id, is_guest, confirmed_at, notified_at, voucher_sent_at")
    .eq("competition", competition)
    .order("place");

  const out: PredictionWinnerRow[] = [];
  for (const r of rows ?? []) {
    const contact = await getWinnerContact(supabaseAdmin, competition, r.user_id, !!r.is_guest);
    out.push({
      place: r.place as 1 | 2 | 3,
      userId: r.user_id,
      isGuest: !!r.is_guest,
      displayName: contact.displayName || null,
      confirmed: !!r.confirmed_at,
      confirmedAt: r.confirmed_at,
      notifiedAt: r.notified_at,
      email: canSeeEmails ? contact.email : null,
      isMe: r.is_guest ? r.user_id === viewerGuestId : r.user_id === viewerUserId,
      voucherSent: !!(r as any).voucher_sent_at,
      voucherSentAt: (r as any).voucher_sent_at ?? null,
    });
  }
  return out;
}

export const getPredictionWinners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ competition: CompSchema, guestId: z.string().uuid().nullable().optional() }).parse(input))
  .handler(async ({ data, context }): Promise<{ winners: PredictionWinnerRow[]; canSeeEmails: boolean }> => {
    const { supabase, userId } = context;
    const canSeeEmails = await callerCanManage(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    return { winners: await readPredictionWinners(supabaseAdmin, data.competition, canSeeEmails, userId, data.guestId ?? null), canSeeEmails };
  });

export const getPredictionWinnersPublic = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ competition: CompSchema, guestId: z.string().uuid().nullable().optional() }).parse(input))
  .handler(async ({ data }): Promise<{ winners: PredictionWinnerRow[]; canSeeEmails: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return {
      winners: await readPredictionWinners(supabaseAdmin, data.competition, false, null, data.guestId ?? null),
      canSeeEmails: false,
    };
  });

export const confirmPredictionWinnerEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ competition: CompSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("prediction_winners")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("competition", data.competition)
      .eq("is_guest", false)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("You're not on the winners list for this competition.");
    return { ok: true };
  });

export const confirmPredictionGuestWinnerEmail = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      competition: CompSchema,
      email: z.string().trim().toLowerCase().email().max(255),
      pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const guest = await authenticateWinnerGuest(supabaseAdmin, data.competition, data.email, data.pin);
    const { data: row, error } = await supabaseAdmin
      .from("prediction_winners")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("competition", data.competition)
      .eq("is_guest", true)
      .eq("user_id", guest.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("You're not on the winners list for this competition.");
    return { ok: true, guestId: guest.id };
  });

export const setPredictionWinnerVoucherSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      competition: CompSchema,
      place: z.number().int().min(1).max(3),
      sent: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await callerCanManage(supabase, userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("prediction_winners")
      .update({
        voucher_sent_at: data.sent ? new Date().toISOString() : null,
        voucher_sent_by: data.sent ? userId : null,
      } as never)
      .eq("competition", data.competition)
      .eq("place", data.place);
    if (error) throw new Error(error.message);
    return { ok: true };
  });