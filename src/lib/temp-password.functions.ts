import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canRequestPasswordReset, canSendTempPassword } from "@/lib/temp-password";
import { passwordChangeInput, passwordChoiceAccepted } from "@/lib/password-reset";
import { updatePasswordAuthUser } from "@/lib/password-auth-update";
import { manualCustomerInput, saveManualCustomer } from "@/lib/manual-customer-onboarding";

/**
 * Admin only: emails a recovery request without changing the existing password.
 * The customer must confirm their chosen password after their next sign-in.
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

/** Clear the requirement after Auth accepts either a changed or unchanged password. */
export const completeRequiredPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ password: z.string().min(6), currentPassword: z.string(), recovery: z.boolean(), profile: z.object({ username: z.string(), displayName: z.string() }).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: flag, error: flagError } = await context.supabase.from("password_change_required").select("created_at").eq("user_id", context.userId).maybeSingle();
    if (flagError) throw new Error("Couldn't check your password-change request. Please try again.");
    const attributes = passwordChangeInput(data.password, data.currentPassword, data.recovery);
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    const authorization = getRequestHeader("authorization") ?? "";
    if (!url || !key) throw new Error("Password changes are temporarily unavailable. Please try again.");
    // Keep the middleware-verified user's bearer: updateUser() on that stateless
    // SDK client fails locally before it sends any password update to Auth.
    const updateAuth = (input: Parameters<typeof updatePasswordAuthUser>[3]) => updatePasswordAuthUser(url, key, authorization, input);
    const { error } = await updateAuth({ ...attributes, ...(data.profile ? { data: { needs_profile: false, username: data.profile.username, display_name: data.profile.displayName } } : {}) });
    if (!passwordChoiceAccepted(error)) throw new Error(error?.message ?? "Couldn't confirm your password.");
    // Auth may reject the whole update when the password is unchanged.
    // Complete first-login metadata separately before releasing the access gate.
    if (error?.code === "same_password" && data.profile) {
      const { error: profileError } = await updateAuth({ data: { needs_profile: false, username: data.profile.username, display_name: data.profile.displayName } });
      if (profileError) throw new Error(profileError.message);
    }
    if (flag) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: clearError } = await supabaseAdmin.from("password_change_required").delete().eq("user_id", context.userId).eq("created_at", flag.created_at);
      if (clearError) throw new Error("Password updated, but access couldn't be restored. Please contact support.");
    }
    return { updated: true };
  });

/** Admin/management: save a manual customer contact, never create an account. */
export const createUserManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => manualCustomerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (!canSendTempPassword((roles ?? []).map(r => String(r.role)))) throw new Error("Only admin and management can do this.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return saveManualCustomer(supabaseAdmin, context.userId, data);
  });
