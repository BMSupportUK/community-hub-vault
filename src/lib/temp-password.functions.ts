import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canRequestPasswordReset, canSendTempPassword, generateTempPassword } from "@/lib/temp-password";
import { passwordChangeInput } from "@/lib/password-reset";

/**
 * Admin only: emails a recovery request without changing the existing password.
 * The customer must choose a new password after their next sign-in.
 */
export const requestCustomerPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;
    const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", callerId);
    if (error) throw new Error(error.message);
    if (!canRequestPasswordReset((roles ?? []).map((r) => String(r.role)))) throw new Error("Only admin can request a password reset.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const email = target?.user?.email;
    if (!email) throw new Error("This account has no email address.");

    const { error: flagError } = await supabaseAdmin.from("password_change_required").upsert({ user_id: data.userId, set_by: callerId, created_at: new Date().toISOString() });
    if (flagError) throw new Error("Couldn't require the password change. No email was sent.");
    const { error: sendError } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: "https://bmsupport.uk/reset-password" });
    if (sendError) throw new Error(`Password change is required, but the reset email couldn't be sent: ${sendError.message}. Please retry.`);
    return { sent: true };
  });

/** Only clear the requirement after Auth accepts a different password. */
export const completeRequiredPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ password: z.string().min(6), currentPassword: z.string(), recovery: z.boolean(), profile: z.object({ username: z.string(), displayName: z.string() }).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: flag, error: flagError } = await context.supabase.from("password_change_required").select("created_at").eq("user_id", context.userId).maybeSingle();
    if (flagError) throw new Error("Couldn't check your password-change request. Please try again.");
    const attributes = passwordChangeInput(data.password, data.currentPassword, data.recovery);
    const { error } = await context.supabase.auth.updateUser({ ...attributes, ...(data.profile ? { data: { needs_profile: false, username: data.profile.username, display_name: data.profile.displayName } } : {}) });
    if (error) throw new Error(error.code === "same_password" ? "Choose a different password from your current one." : error.message);
    if (flag) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: clearError } = await supabaseAdmin.from("password_change_required").delete().eq("user_id", context.userId).eq("created_at", flag.created_at);
      if (clearError) throw new Error("Password updated, but access couldn't be restored. Please contact support.");
    }
    return { updated: true };
  });

/**
 * Admin/management only: creates an approved member account, emails them
 * their login details, and makes them choose their own password on first sign-in.
 */
export const createUserManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().trim().toLowerCase().email().max(255).optional().or(z.literal("")),
      name: z.string().trim().min(1).max(100).optional().or(z.literal("")),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;
    const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", callerId);
    if (error) throw new Error(error.message);
    if (!canSendTempPassword((roles ?? []).map((r) => String(r.role)))) throw new Error("Only admin and management can do this.");

    const email = data.email?.trim() || "";
    const name = data.name?.trim() || "";
    if (!email && !name) throw new Error("Enter a name or an email address.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Name only: list the customer without an account or email.
    if (!email) {
      const { data: row, error: nErr } = await supabaseAdmin
        .from("manual_name_customers")
        .insert({ name, created_by: callerId } as never)
        .select("id")
        .single();
      if (nErr || !row) throw new Error("The customer could not be added to the customer list. Please try again.");
      return { userId: (row as { id: string }).id, sent: false, banned: false, nameOnly: true };
    }

    // Customer chooses their own username/display name on first sign-in.
    const placeholder = `user_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

    const password = generateTempPassword();
    const displayName: string | undefined = undefined;
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: placeholder, display_name: placeholder, needs_profile: true, admin_created: true },
    });
    if (cErr || !created?.user) {
      throw new Error(/already/i.test(cErr?.message ?? "") ? "An account with that email already exists." : cErr?.message ?? "Couldn't create the account.");
    }
    const id = created.user.id;

    const { error: customerError } = await supabaseAdmin.from("manually_added_customers").insert({ user_id: id, created_by: callerId });
    if (customerError) {
      await supabaseAdmin.auth.admin.deleteUser(id);
      throw new Error("The customer could not be added to the customer list. Please try again.");
    }

    // Added by staff = already approved: member role, gate application closed.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", id).eq("role", "pending" as never);
    const { data: isBanned } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", id).eq("role", "banned" as never).maybeSingle();
    if (!isBanned) {
      await supabaseAdmin.from("user_roles").insert({ user_id: id, role: "member" } as never);
      await supabaseAdmin.from("gate_applications").update({ status: "approved", reviewed_by: callerId, reviewed_at: new Date().toISOString() } as never).eq("user_id", id);
    }
    await supabaseAdmin.from("password_change_required").upsert({ user_id: id, set_by: callerId } as never);

    const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
    const res = await sendAndLogEmail(supabaseAdmin, "manual-account-login", email, {
      templateData: { displayName, email, password, loginUrl: "https://bmsupport.uk/login" },
      idempotencyKey: `new-account-${id}`,
    });
    return { userId: id, sent: res.sent, banned: !!isBanned };
  });
