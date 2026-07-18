import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as React from "react";
import { render } from "@react-email/components";
import { template as vaultPinResetTpl } from "@/lib/email-templates/vault-pin-reset";

const SITE_NAME = "BM Support";
const SENDER_DOMAIN = "notify.bmsupport.uk";
const FROM_DOMAIN = "bmsupport.uk";
const LOGIN_URL = "https://bmsupport.uk";

export const resetUserVaultPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
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
    // Reset PIN to "0000" (sha256 of `${user_id}:0000`) so the user can unlock
    // and is prompted to change it. Matches client-side hashing scheme.
    const enc = new TextEncoder().encode(`${data.userId}:0000`);
    const digest = await crypto.subtle.digest("SHA-256", enc);
    const pinHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { error } = await supabaseAdmin
      .from("vault_pins")
      .upsert({ user_id: data.userId, pin_hash: pinHash, must_change: true });
    if (error) throw new Error(error.message);

    // Notify the user by email with the temporary PIN
    try {
      const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
      const toEmail = targetUser?.user?.email;
      if (toEmail) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("display_name, username")
          .eq("id", data.userId)
          .maybeSingle();
        const userName = (prof as any)?.display_name || (prof as any)?.username || undefined;

        let resetByName: string | undefined;
        const { data: adminProf } = await supabaseAdmin
          .from("profiles")
          .select("display_name, username")
          .eq("id", userId)
          .maybeSingle();
        resetByName = (adminProf as any)?.display_name || (adminProf as any)?.username || undefined;

        const el = React.createElement(vaultPinResetTpl.component, {
          userName, tempPin: "0000", resetByName, loginUrl: LOGIN_URL,
        });
        const html = await render(el);
        const text = await render(el, { plainText: true });
        const subject = typeof vaultPinResetTpl.subject === "function"
          ? vaultPinResetTpl.subject({})
          : vaultPinResetTpl.subject;

        const messageId = crypto.randomUUID();
        await supabaseAdmin.from("email_send_log").insert({
          message_id: messageId,
          template_name: "vault-pin-reset",
          recipient_email: toEmail,
          status: "pending",
        } as never);
        const unsubToken = Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((x) => x.toString(16).padStart(2, "0")).join("");
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
            label: "vault-pin-reset",
            idempotency_key: `vault-pin-reset-${data.userId}-${Date.now()}`,
            unsubscribe_token: unsubToken,
            queued_at: new Date().toISOString(),
          },
        } as never);
        if (qErr) console.error("vault-pin-reset enqueue failed", qErr);
      }
    } catch (e) {
      console.error("vault-pin-reset notification failed", e);
    }

    return { success: true, tempPin: "0000" };
  });
