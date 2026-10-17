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

/**
 * Admin/management only: creates an approved member account, emails them
 * their login details, and makes them choose their own password on first sign-in.
 */
export const createUserManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().trim().toLowerCase().email().max(255),
      username: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_.-]+$/, "Username can only use letters, numbers, _ . -"),
      displayName: z.string().trim().max(60).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;
    const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", callerId);
    if (error) throw new Error(error.message);
    if (!canSendTempPassword((roles ?? []).map((r) => String(r.role)))) throw new Error("Only admin and management can do this.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: taken } = await supabaseAdmin.from("profiles").select("id").ilike("username", data.username).maybeSingle();
    if (taken) throw new Error("That username is already taken.");

    const password = generateTempPassword();
    const displayName = data.displayName || data.username;
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { username: data.username, display_name: displayName },
    });
    if (cErr || !created?.user) {
      throw new Error(/already/i.test(cErr?.message ?? "") ? "An account with that email already exists." : cErr?.message ?? "Couldn't create the account.");
    }
    const id = created.user.id;

    // Added by staff = already approved: member role, gate application closed.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", id).eq("role", "pending" as never);
    const { data: isBanned } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", id).eq("role", "banned" as never).maybeSingle();
    if (!isBanned) {
      await supabaseAdmin.from("user_roles").insert({ user_id: id, role: "member" } as never);
      await supabaseAdmin.from("gate_applications").update({ status: "approved", reviewed_by: callerId, reviewed_at: new Date().toISOString() } as never).eq("user_id", id);
    }
    await supabaseAdmin.from("password_change_required").upsert({ user_id: id, set_by: callerId } as never);

    const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
    const res = await sendAndLogEmail(supabaseAdmin, "temporary-password", data.email, {
      templateData: { displayName, email: data.email, password, loginUrl: "https://bmsupport.uk/login", isNewAccount: true },
      idempotencyKey: `new-account-${id}`,
    });
    return { userId: id, sent: res.sent, banned: !!isBanned };
  });
