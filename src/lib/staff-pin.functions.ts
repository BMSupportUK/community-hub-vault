import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Staff PINs are issued by admins, stored encrypted + hashed in the database,
// and only ever checked or revealed on the server after re-confirming the
// staff member's account password.

async function checkPassword(email: string, password: string): Promise<boolean> {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  // Only drop this throwaway check session. A default (global) sign-out
  // revokes every session on the account and logs the user out everywhere.
  await client.auth.signOut({ scope: "local" }).catch(() => {});
  return true;
}

async function emailFor(userId: string, claims: any): Promise<string | null> {
  if (claims?.email) return String(claims.email);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => String(r.role));
  if (!roles.some((r: string) => r === "admin" || r === "management")) throw new Error("Forbidden");
}

export const unlockWithStaffPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ password: z.string().min(1).max(200), pin: z.string().min(1).max(20) }).parse(i))
  .handler(async ({ data, context }) => {
    const email = await emailFor(context.userId, context.claims);
    if (!email || !(await checkPassword(email, data.password))) return { ok: false, error: "Incorrect password" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ok } = await supabaseAdmin.rpc("staff_pin_check" as any, { p_user: context.userId, p_pin: data.pin.trim() });
    if (!ok) return { ok: false, error: "Incorrect staff PIN" };
    return { ok: true };
  });

export const revealMyStaffPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ password: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const email = await emailFor(context.userId, context.claims);
    if (!email || !(await checkPassword(email, data.password))) return { ok: false as const, error: "Incorrect password" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pin } = await supabaseAdmin.rpc("staff_pin_reveal" as any, { p_user: context.userId });
    const { data: row } = await supabaseAdmin.from("vault_pins").select("issued_at, updated_at").eq("user_id", context.userId).maybeSingle();
    return { ok: true as const, pin: (pin as string | null) ?? null, issuedAt: (row as any)?.issued_at ?? (row as any)?.updated_at ?? null };
  });

export const requestStaffPinReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ reason: z.string().max(500).optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pending } = await supabaseAdmin
      .from("staff_pin_reset_requests" as any).select("id").eq("user_id", context.userId).eq("status", "pending").limit(1);
    if ((pending ?? []).length > 0) return { ok: true, already: true };
    const { error } = await supabaseAdmin.from("staff_pin_reset_requests" as any).insert({ user_id: context.userId, reason: data.reason ?? null });
    if (error) throw new Error(error.message);
    const { data: prof } = await supabaseAdmin.from("profiles").select("display_name, username").eq("id", context.userId).maybeSingle();
    const name = (prof as any)?.display_name || (prof as any)?.username || "A staff member";
    await supabaseAdmin.from("staff_notifications").insert({
      kind: "staff_pin_reset",
      title: `${name} requested a new staff PIN`,
      body: data.reason ? `Reason: ${data.reason}` : "Issue a new PIN from the admin dashboard.",
      link_path: "/admin",
      entity_id: context.userId,
    });
    return { ok: true, already: false };
  });

export const listStaffPinRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reqs } = await supabaseAdmin
      .from("staff_pin_reset_requests" as any).select("*").order("requested_at", { ascending: false }).limit(50);
    const { data: staffRoles } = await supabaseAdmin
      .from("user_roles").select("user_id").in("role", ["admin", "management", "staff", "moderator"] as any);
    const ids = Array.from(new Set([...(reqs ?? []).map((r: any) => r.user_id), ...(staffRoles ?? []).map((r: any) => r.user_id)]));
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, display_name, username").in("id", ids)
      : { data: [] as any[] };
    const { data: pins } = ids.length
      ? await supabaseAdmin.from("vault_pins").select("user_id, issued_at, updated_at").in("user_id", ids)
      : { data: [] as any[] };
    const name = new Map((profs ?? []).map((p: any) => [p.id, p.display_name || p.username || "Unknown"]));
    const pinAt = new Map((pins ?? []).map((p: any) => [p.user_id, p.issued_at ?? p.updated_at]));
    return {
      requests: (reqs ?? []).map((r: any) => ({ ...r, name: name.get(r.user_id) ?? "Unknown" })),
      staff: Array.from(new Set((staffRoles ?? []).map((r: any) => r.user_id)))
        .map((id) => ({ id, name: name.get(id) ?? "Unknown", pinIssuedAt: pinAt.get(id) ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

export const issueStaffPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const pin = String(bytes[0] % 1_000_000).padStart(6, "0");
    const { error } = await supabaseAdmin.rpc("staff_pin_set" as any, { p_user: data.userId, p_pin: pin, p_by: context.userId });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("staff_pin_reset_requests" as any)
      .update({ status: "issued", resolved_at: new Date().toISOString(), resolved_by: context.userId })
      .eq("user_id", data.userId).eq("status", "pending");
    const { data: adminProf } = await supabaseAdmin.from("profiles").select("display_name, username").eq("id", context.userId).maybeSingle();
    const by = (adminProf as any)?.display_name || (adminProf as any)?.username || "An admin";
    await supabaseAdmin.from("user_notifications").insert({
      user_id: data.userId,
      kind: "mention",
      title: `${by} issued you a new staff PIN`,
      body: "Open your profile's Staff PIN tab and enter your password to view it.",
      link_path: "/profile",
      source_type: "staff_pin",
    } as any);
    return { ok: true };
  });
