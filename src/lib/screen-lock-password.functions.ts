import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { passwordUnlockMatches, screenUnlockAwaitingMfa } from "@/lib/screen-lock-password";

export const verifyScreenLockPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    password: z.string().min(1).max(4096),
    secondFactor: z.boolean().default(false),
  }).strict().parse(input))
  .handler(async ({ data, context }) => {
    // Resolve identity from the verified bearer, never from caller-supplied email.
    const { data: current, error: identityError } = await context.supabase.auth.getUser();
    if (identityError || !current.user?.email || current.user.id !== context.userId) {
      throw new Error("Please sign out and sign in again.");
    }
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Password checking is unavailable. Please try again.");
    // Isolated, non-persistent client: never replace the app's session or MFA level.
    const verifier = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: result, error } = await verifier.auth.signInWithPassword({
      email: current.user.email,
      password: data.password,
    });
    const verified = passwordUnlockMatches(context.userId, result.user?.id, error);
    // Retire only the short-lived verification session, not the user's app session.
    if (result.session) await verifier.auth.signOut({ scope: "local" });
    if (error && error.code !== "invalid_credentials") {
      throw new Error("Couldn't check your password. Please try again shortly.");
    }
    if (!verified) return { verified: false, requiresTwoFactor: false };
    const { data: roleRows, error: roleError } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (roleError) throw new Error("Couldn't verify your account role. Please try again.");
    const roles = (roleRows ?? []).map((row) => String(row.role));
    if (screenUnlockAwaitingMfa(roles, data.secondFactor, context.claims)) {
      return { verified: true, requiresTwoFactor: true };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { grantApplicationAccess } = await import("./application-access.server");
    await grantApplicationAccess(supabaseAdmin, context.userId, context.claims["session_id"], "screen", new Date(Date.now() + 60 * 60_000).toISOString());
    return { verified: true, requiresTwoFactor: false };
  });