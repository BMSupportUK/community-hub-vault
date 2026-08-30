import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as React from "react";
import { render } from "@react-email/components";
import { template as screenLockResetTpl } from "@/lib/email-templates/screen-lock-reset";

const SITE_NAME = "BM Support";
const SENDER_DOMAIN = "notify.bmsupport.uk";
const FROM_DOMAIN = "bmsupport.uk";
const LOGIN_URL = "https://bmsupport.uk";

/** A signed-in user asks Owner/Management to reset their forgotten lock code. */
export const requestLockReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("screen_lock_reset_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) return { success: true, alreadyPending: true };

    const { error } = await supabase
      .from("screen_lock_reset_requests")
      .insert({ user_id: userId, status: "pending" });
    if (error) throw new Error(error.message);
    return { success: true, alreadyPending: false };
  });

/** Owner/Management approve a reset: temp code stored + emailed to the user. */
export const approveLockReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw new Error(rolesError.message);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    if (!callerRoles.some((r) => r === "admin" || r === "management")) {
      throw new Error("Forbidden: admin or management only");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("screen_lock_reset_requests")
      .select("id, user_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req) throw new Error("Request not found");
    const targetUserId = (req as { user_id: string }).user_id;

    // 6-digit temporary code
    const bytes = crypto.getRandomValues(new Uint32Array(1));
    const tempCode = String(100000 + ((bytes[0] ?? 0) % 900000));

    const enc = new TextEncoder().encode(`${targetUserId}:${tempCode}`);
    const digest = await crypto.subtle.digest("SHA-256", enc);
    const codeHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { error: upErr } = await supabaseAdmin
      .from("screen_lock_settings")
      .update({ code_hash: codeHash, must_change: true } as never)
      .eq("user_id", targetUserId);
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin
      .from("screen_lock_reset_requests")
      .update({ status: "approved", handled_by: userId, handled_at: new Date().toISOString() } as never)
      .eq("id", data.requestId);

    try {
      const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      const toEmail = targetUser?.user?.email;
      if (toEmail) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("display_name, username")
          .eq("id", targetUserId)
          .maybeSingle();
        const userName =
          (prof as { display_name?: string; username?: string } | null)?.display_name ||
          (prof as { display_name?: string; username?: string } | null)?.username ||
          undefined;

        const { data: adminProf } = await supabaseAdmin
          .from("profiles")
          .select("display_name, username")
          .eq("id", userId)
          .maybeSingle();
        const resetByName =
          (adminProf as { display_name?: string; username?: string } | null)?.display_name ||
          (adminProf as { display_name?: string; username?: string } | null)?.username ||
          undefined;

        const el = React.createElement(screenLockResetTpl.component, {
          userName,
          tempCode,
          resetByName,
          loginUrl: LOGIN_URL,
        });
        const html = await render(el);
        const text = await render(el, { plainText: true });
        const subject =
          typeof screenLockResetTpl.subject === "function"
            ? (screenLockResetTpl.subject as (d: Record<string, unknown>) => string)({})
            : screenLockResetTpl.subject;

        const messageId = crypto.randomUUID();
        await supabaseAdmin.from("email_send_log").insert({
          message_id: messageId,
          template_name: "screen-lock-reset",
          recipient_email: toEmail,
          status: "pending",
        } as never);
        const unsubToken = Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
        const { error: qErr } = await supabaseAdmin.rpc("enqueue_email" as never, {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId,
            to: toEmail,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject,
            html,
            text,
            purpose: "transactional",
            label: "screen-lock-reset",
            idempotency_key: `screen-lock-reset-${targetUserId}-${Date.now()}`,
            unsubscribe_token: unsubToken,
            queued_at: new Date().toISOString(),
          },
        } as never);
        if (qErr) console.error("screen-lock-reset enqueue failed", qErr);
      }
    } catch (e) {
      console.error("screen-lock-reset notification failed", e);
    }

    return { success: true };
  });

/** Owner/Management dismiss a request without resetting. */
export const denyLockReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("screen_lock_reset_requests")
      .update({ status: "denied", handled_by: userId, handled_at: new Date().toISOString() })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { success: true };
  });
