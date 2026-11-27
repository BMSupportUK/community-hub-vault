import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { gateExpiry } from "./security-gate-policy";

export const sensitiveGateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ gate: z.enum(["shop-orders", "discounts", "player"]) }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { data: open, error } = await context.supabase.rpc("sensitive_gate_open", { p_gate: data.gate });
    return { open: !error && open === true };
  });

export const revokeSensitiveGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ gate: z.enum(["shop-orders", "discounts"]) }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const session = context.claims["session_id"];
    if (typeof session !== "string") return { revoked: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sensitive_gate_sessions").delete()
      .eq("user_id", context.userId).eq("session_id", session).eq("gate", data.gate);
    if (error) throw new Error("Unable to lock this section.");
    return { revoked: true };
  });

export const unlockSensitiveGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ gate: z.enum(["shop-orders", "discounts"]), password: z.string().min(1).max(200), pin: z.string().min(1).max(20) }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (error || !(roles ?? []).some(r => r.role === "admin" || (data.gate === "shop-orders" && r.role === "management"))) throw new Error("Not allowed");
    const session = context.claims["session_id"];
    if (typeof session !== "string") throw new Error("Please sign in again.");
    const { data: identity } = await context.supabase.auth.getUser();
    if (identity.user?.id !== context.userId || !identity.user.email) throw new Error("Please sign in again.");
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Unlock is unavailable.");
    const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key); return fetch(input, { ...init, headers });
    } } });
    const { data: signed, error: signError } = await verifier.auth.signInWithPassword({ email: identity.user.email, password: data.password });
    const valid = !signError && signed.user?.id === context.userId && !!signed.session;
    if (signed.session) await verifier.auth.signOut({ scope: "local" });
    if (!valid) throw new Error("Incorrect password");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pinOk, error: pinError } = await supabaseAdmin.rpc("staff_pin_check", { p_user: context.userId, p_pin: data.pin.trim() });
    if (pinError || !pinOk) throw new Error("Incorrect PIN");
    const until = gateExpiry(data.gate);
    const { error: writeError } = await supabaseAdmin.from("sensitive_gate_sessions").upsert({ user_id: context.userId, session_id: session, gate: data.gate, unlocked_until: until });
    if (writeError) throw new Error("Unable to unlock. Please try again.");
    return { until };
  });