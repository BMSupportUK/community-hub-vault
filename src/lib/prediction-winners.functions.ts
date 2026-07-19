import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as React from "react";
import { render } from "@react-email/components";
import { template as winnerTpl } from "@/lib/email-templates/winner-notification";

const SITE_NAME = "BM Support";
const SENDER_DOMAIN = "notify.bmsupport.uk";
const FROM_DOMAIN = "bmsupport.uk";

const CompSchema = z.enum(["wc2026", "boro2026"]);

const COMP_META: Record<"wc2026" | "boro2026", { title: string; winnersUrl: string }> = {
  wc2026: { title: "World Cup 2026 Predictor", winnersUrl: "https://bmsupport.uk/predictions?tab=winners" },
  boro2026: { title: "MFC 2026/27 Predictor", winnersUrl: "https://bmsupport.uk/boro-predictions?tab=winners" },
};

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
        .array(z.object({ userId: z.string().uuid(), place: z.number().int().min(1).max(3) }))
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
    const existingUserIds = new Set<string>();
    const { data: existing } = await supabaseAdmin
      .from("prediction_winners")
      .select("user_id")
      .eq("competition", data.competition);
    (existing ?? []).forEach((r: any) => existingUserIds.add(r.user_id));

    for (const w of data.winners) {
      await supabaseAdmin.from("prediction_winners").upsert(
        { competition: data.competition, place: w.place, user_id: w.userId },
        { onConflict: "competition,place" },
      );
    }

    // Fetch the current winners after upsert
    const { data: rows } = await supabaseAdmin
      .from("prediction_winners")
      .select("id, place, user_id, notified_at")
      .eq("competition", data.competition)
      .order("place");

    const meta = COMP_META[data.competition];
    let sent = 0;

    for (const row of rows ?? []) {
      if (row.notified_at) continue;
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
        const email = u?.user?.email;
        if (!email) continue;
        const { data: prof } = await supabaseAdmin
          .from("profiles").select("display_name, username").eq("id", row.user_id).maybeSingle();
        const displayName = (prof as any)?.display_name || (prof as any)?.username || "Winner";

        const props = { displayName, place: row.place, competitionTitle: meta.title, winnersUrl: meta.winnersUrl };
        const el = React.createElement(winnerTpl.component, props);
        const html = await render(el);
        const text = await render(el, { plainText: true });
        const subject = typeof winnerTpl.subject === "function"
          ? (winnerTpl.subject as (d: Record<string, any>) => string)(props)
          : winnerTpl.subject;

        const messageId = crypto.randomUUID();
        await supabaseAdmin.from("email_send_log").insert({
          message_id: messageId, template_name: "winner-notification", recipient_email: email, status: "pending",
        } as never);

        const { error: qErr } = await supabaseAdmin.rpc("enqueue_email" as never, {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId,
            to: email,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject,
            html,
            text,
            purpose: "transactional",
            label: "winner-notification",
            idempotency_key: `winner-${data.competition}-${row.user_id}`,
            unsubscribe_token: newId(),
            queued_at: new Date().toISOString(),
          },
        } as never);
        if (!qErr) {
          await supabaseAdmin.from("prediction_winners")
            .update({ notified_at: new Date().toISOString() }).eq("id", row.id);
          sent += 1;
        } else {
          console.error("winner enqueue failed", qErr);
        }
      } catch (e) {
        console.error("winner notification failed", e);
      }
    }

    return { ok: true, sent };
  });

export type PredictionWinnerRow = {
  place: 1 | 2 | 3;
  userId: string;
  displayName: string | null;
  confirmed: boolean;
  confirmedAt: string | null;
  notifiedAt: string | null;
  email: string | null;
  isMe: boolean;
};

export const getPredictionWinners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ competition: CompSchema }).parse(input))
  .handler(async ({ data, context }): Promise<{ winners: PredictionWinnerRow[]; canSeeEmails: boolean }> => {
    const { supabase, userId } = context;
    const canSeeEmails = await callerCanManage(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("prediction_winners")
      .select("place, user_id, confirmed_at, notified_at")
      .eq("competition", data.competition)
      .order("place");

    const out: PredictionWinnerRow[] = [];
    for (const r of rows ?? []) {
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("display_name, username").eq("id", r.user_id).maybeSingle();
      let email: string | null = null;
      if (canSeeEmails) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        email = u?.user?.email ?? null;
      }
      out.push({
        place: r.place as 1 | 2 | 3,
        userId: r.user_id,
        displayName: (prof as any)?.display_name || (prof as any)?.username || null,
        confirmed: !!r.confirmed_at,
        confirmedAt: r.confirmed_at,
        notifiedAt: r.notified_at,
        email,
        isMe: r.user_id === userId,
      });
    }
    return { winners: out, canSeeEmails };
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
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("You're not on the winners list for this competition.");
    return { ok: true };
  });