import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { applicationAccessSchema, freshSecondFactor } from "./application-access-policy";

export const getApplicationAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  setResponseHeader("cache-control", "no-store");
  const { portalAdminAccessExpiresAt } = await import("./portal-admin-access.server");
  const bypassUntil = await portalAdminAccessExpiresAt(context.userId);
  if (bypassUntil) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { grantApplicationAccess } = await import("./application-access.server");
    await grantApplicationAccess(supabaseAdmin, context.userId, context.claims["session_id"], "screen-bypass", bypassUntil);
    await grantApplicationAccess(supabaseAdmin, context.userId, context.claims["session_id"], "portal", bypassUntil);
  }
  if (!bypassUntil && typeof context.claims["session_id"] === "string") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("application_access_sessions").delete().eq("user_id", context.userId).eq("session_id", context.claims["session_id"]).eq("scope", "screen-bypass");
  }
  const { data, error } = await context.supabase.rpc("application_access_status");
  if (error) throw new Error("Unable to verify access.");
  return applicationAccessSchema.parse(data);
});

export const screenAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ activity: z.boolean().default(false), lock: z.boolean().default(false) }).strict().parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("cache-control", "no-store");
    const { data: result, error } = await context.supabase.rpc("application_screen_status", { p_activity: data.activity, p_lock: data.lock });
    if (error) throw new Error("Unable to verify your screen lock.");
    return z.object({ open: z.boolean(), enabled: z.boolean(), timeout_minutes: z.number() }).parse(result);
  });

export const revokeDashboardAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { error } = await context.supabase.rpc("application_revoke_dashboard");
  if (error) throw new Error("Unable to lock the dashboard.");
  return { revoked: true };
});

export const unlockDashboardFactor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ backupCode: z.string().max(40).optional() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (error || !(roles ?? []).some(r => r.role === "admin" || r.role === "management")) throw new Error("Not allowed");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allowed } = await supabaseAdmin.rpc("manual_credentials_throttle", { p_key: `dashboard-factor:${context.userId}`, p_limit: 10 });
    if (!allowed) throw new Error("Too many attempts. Please try again later.");
    if (data.backupCode) {
      const normalized = data.backupCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (normalized.length < 8) throw new Error("Invalid backup code");
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${context.userId}:${normalized}`))), n => n.toString(16).padStart(2, "0")).join("");
      const { data: used, error: useError } = await supabaseAdmin.rpc("application_consume_backup", { p_user: context.userId, p_hash: hash });
      if (useError || !used) throw new Error("Invalid or already used backup code");
    } else if (!freshSecondFactor(context.claims)) throw new Error("Enter a fresh authenticator code.");
    const { grantApplicationAccess } = await import("./application-access.server");
    const until = new Date(Date.now() + 60 * 60_000).toISOString();
    await grantApplicationAccess(supabaseAdmin, context.userId, context.claims["session_id"], "dashboard", until);
    return { until };
  });
