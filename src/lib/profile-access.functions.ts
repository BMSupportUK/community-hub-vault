import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProfileAccess } from "./profile-access";
import { staffPasswordReturnAllowed } from "./profile-access";

export const getProfileAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("my_profile_access");
    if (error) throw new Error("Unable to verify profile permissions.");
    return data as unknown as ProfileAccess;
  });

export const selectAccountProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: access, error } = await context.supabase.rpc("select_customer_profile", { _credential: data.profileId });
    if (error) throw new Error("Unable to switch profile. Staff access requires your password.");
    return access as unknown as ProfileAccess;
  });

export const restoreStaffProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ profileId: z.string().uuid(), password: z.string().min(1).max(4096) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: sid, error: sessionError } = await context.supabase.rpc("profile_auth_session_id");
    if (sessionError || typeof sid !== "string") throw new Error("Sign in again to restore staff access.");
    const { data: identity, error: identityError } = await context.supabase.auth.getUser();
    if (identityError || !identity.user?.email || identity.user.id !== context.userId) throw new Error("Sign in again.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: scope, error: scopeError } = await supabaseAdmin.from("profile_session_access").select("password_failures,password_window_at,restricted").eq("session_id", sid).eq("user_id", context.userId).maybeSingle();
    if (scopeError || !scope?.restricted) throw new Error("No customer profile session to restore.");
    const { data: attempt, error: attemptError } = await supabaseAdmin.rpc("claim_profile_password_attempt", { _session: sid, _owner: context.userId });
    if (attemptError || !attempt) throw new Error("Too many attempts. Try again in 15 minutes.");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Password checking is unavailable.");
    const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: checked, error } = await verifier.auth.signInWithPassword({ email: identity.user.email, password: data.password });
    if (checked.session) await verifier.auth.signOut({ scope: "local" });
    if (error || checked.user?.id !== context.userId) throw new Error("Incorrect account password.");
    if (!staffPasswordReturnAllowed(context.userId, checked.user?.id, error, identity.user.factors?.some((f) => f.status === "verified") ?? false, context.claims.aal)) throw new Error("Sign in again and complete two-factor verification to restore staff access.");
    const { data: restored, error: restoreError } = await supabaseAdmin.rpc("restore_profile_staff_scope", { _session: sid, _owner: context.userId, _credential: data.profileId });
    if (restoreError || !restored) throw new Error("This account no longer has staff access.");
    return { success: true };
  });