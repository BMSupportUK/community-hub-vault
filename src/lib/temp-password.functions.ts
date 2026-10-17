import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canSendTempPassword, generateTempPassword } from "@/lib/temp-password";

/**
 * Admin/management only: sets a new temporary password on a user's account,
 * emails it to them, and makes them choose their own password after signing in.
 */
export const sendTemporaryPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;
    const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", callerId);
    if (error) throw new Error(error.message);
    if (!canSendTempPassword((roles ?? []).map((r) => String(r.role)))) throw new Error("Only admin and management can do this.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const email = target?.user?.email;
    if (!email) throw new Error("This account has no email address.");

    const password = generateTempPassword();
    const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password });
    if (upErr) throw new Error(upErr.message);
    await supabaseAdmin.from("password_change_required").upsert({ user_id: data.userId, set_by: callerId, created_at: new Date().toISOString() } as never);

    const { data: prof } = await supabaseAdmin.from("profiles").select("display_name, username").eq("id", data.userId).maybeSingle();
    const displayName = (prof as { display_name?: string; username?: string } | null)?.display_name || (prof as { username?: string } | null)?.username || undefined;

    const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
    const res = await sendAndLogEmail(supabaseAdmin, "temporary-password", email, {
      templateData: { displayName, email, password, loginUrl: "https://bmsupport.uk/login" },
      idempotencyKey: `temporary-password-${data.userId}-${Date.now()}`,
    });
    if (!res.sent) throw new Error(`Password changed, but the email couldn't be sent (${res.reason ?? "unknown"}).`);
    return { sent: true };
  });
