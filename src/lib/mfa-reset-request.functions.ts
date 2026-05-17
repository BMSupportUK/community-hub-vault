import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as React from "react";
import { render } from "@react-email/components";
import { template as adminTpl } from "@/lib/email-templates/twofa-reset-admin";
import { template as userTpl } from "@/lib/email-templates/twofa-reset-user";

const SITE_NAME = "BM Support";
const SENDER_DOMAIN = "notify.bmsupport.uk";
const FROM_DOMAIN = "bmsupport.uk";

function newId() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function enqueue(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  label: string;
  idempotencyKey: string;
}) {
  const messageId = crypto.randomUUID();
  await supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: opts.label,
    recipient_email: opts.to,
    status: "pending",
  } as never);
  const { error } = await supabaseAdmin.rpc("enqueue_email" as never, {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: opts.to,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      purpose: "transactional",
      label: opts.label,
      idempotency_key: opts.idempotencyKey,
      unsubscribe_token: newId(),
      queued_at: new Date().toISOString(),
    },
  } as never);
  if (error) throw new Error(error.message);
}

export const requestMfaReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ reason: z.string().trim().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Lookup user
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userErr || !userRes?.user?.email) throw new Error("User not found");
    const userEmail = userRes.user.email;

    // Display name from profiles (best-effort)
    let userName: string | undefined;
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("display_name, username")
      .eq("id", userId)
      .maybeSingle();
    userName = (prof as any)?.display_name || (prof as any)?.username || undefined;

    // Admin/management recipients
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "management"] as never);
    const adminIds = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
    const adminEmails: string[] = [];
    for (const id of adminIds) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
      if (u?.user?.email) adminEmails.push(u.user.email);
    }

    const requestedAt = new Date().toISOString();
    const resetUrl = "https://bmsupport.uk/admin-roles";

    // Render once per template
    const adminEl = React.createElement(adminTpl.component, {
      userEmail, userName, reason: data.reason, resetUrl, requestedAt,
    });
    const adminHtml = await render(adminEl);
    const adminText = await render(adminEl, { plainText: true });
    const adminSubject =
      typeof adminTpl.subject === "function"
        ? adminTpl.subject({ userEmail })
        : adminTpl.subject;

    const userEl = React.createElement(userTpl.component, { userName });
    const userHtml = await render(userEl);
    const userText = await render(userEl, { plainText: true });
    const userSubject =
      typeof userTpl.subject === "function"
        ? (userTpl.subject as (d: Record<string, any>) => string)({})
        : userTpl.subject;

    const idem = `mfa-reset-${userId}-${Date.now()}`;

    // Send to admins
    let sentAdmins = 0;
    for (const to of adminEmails) {
      try {
        await enqueue({
          to,
          subject: adminSubject,
          html: adminHtml,
          text: adminText,
          label: "twofa-reset-admin",
          idempotencyKey: `${idem}-admin-${to}`,
        });
        sentAdmins += 1;
      } catch (e) {
        console.error("enqueue admin failed", e);
      }
    }

    // Confirmation to user
    try {
      await enqueue({
        to: userEmail,
        subject: userSubject,
        html: userHtml,
        text: userText,
        label: "twofa-reset-user",
        idempotencyKey: `${idem}-user`,
      });
    } catch (e) {
      console.error("enqueue user failed", e);
    }

    return { ok: true, notifiedAdmins: sentAdmins };
  });