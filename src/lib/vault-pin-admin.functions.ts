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

        const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
        await sendAndLogEmail(supabaseAdmin, "vault-pin-reset", toEmail, {
          templateData: { userName, tempPin: "0000", resetByName, loginUrl: LOGIN_URL },
          idempotencyKey: `vault-pin-reset-${data.userId}-${Date.now()}`,
        });
      }
    } catch (e) {
      console.error("vault-pin-reset notification failed", e);
    }

    return { success: true, tempPin: "0000" };
  });
