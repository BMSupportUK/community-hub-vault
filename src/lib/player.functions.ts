import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_FAILED_CODE_ATTEMPTS_PER_HOUR, linkCodeUsable, normaliseLinkCode } from "@/lib/player-link";

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const Creds = {
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
};

/** Member enters the code their app shows plus a login; the device becomes theirs. */
export const sendLoginWithCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().regex(/^\s*\d{3}\s*\d{3}\s*$/), ...Creds }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabaseAdmin.from("player_link_attempts").select("id", { count: "exact", head: true })
      .eq("user_id", context.userId).gte("created_at", since);
    if ((count ?? 0) >= MAX_FAILED_CODE_ATTEMPTS_PER_HOUR) throw new Error("Too many wrong codes. Please wait an hour and try again.");

    const hash = await sha256Hex(normaliseLinkCode(data.code));
    const { data: row } = await supabaseAdmin.from("player_link_codes").select("device_id, expires_at, used_at").eq("code_hash", hash).maybeSingle();
    if (!linkCodeUsable(row)) {
      await supabaseAdmin.from("player_link_attempts").insert({ user_id: context.userId });
      throw new Error("That code is wrong or has expired. Check the code on your screen.");
    }
    // Single use: only the first claimant flips used_at.
    const { data: claimed } = await supabaseAdmin.from("player_link_codes").update({ used_at: new Date().toISOString() })
      .eq("code_hash", hash).is("used_at", null).select("device_id").maybeSingle();
    if (!claimed) throw new Error("That code has already been used. Get a new code on your screen.");

    const { data: device } = await supabaseAdmin.from("player_devices").select("id, user_id").eq("id", claimed.device_id).maybeSingle();
    if (!device) throw new Error("That device is no longer linked. Get a new code on your screen.");
    if (device.user_id && device.user_id !== context.userId) throw new Error("This device is linked to another account.");
    await supabaseAdmin.from("player_devices").update({ user_id: context.userId, linked_at: new Date().toISOString() }).eq("id", device.id);
    await supabaseAdmin.from("player_pending_credentials").upsert({ device_id: device.id, username: data.username, password: data.password, created_at: new Date().toISOString() });
    return { ok: true };
  });

/** Send a login to one of the member's already-linked devices. */
export const sendLoginToDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ deviceId: z.string().uuid(), ...Creds }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS-scoped read proves ownership before any privileged write.
    const { data: own } = await context.supabase.from("player_devices").select("id, user_id").eq("id", data.deviceId).maybeSingle();
    if (!own || own.user_id !== context.userId) throw new Error("That device isn't linked to your account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("player_pending_credentials").upsert({ device_id: own.id, username: data.username, password: data.password, created_at: new Date().toISOString() });
    return { ok: true };
  });

/** Admin-only DNS read/write, through RLS. */
export const savePlayerDns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dns: z.string().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { normaliseDns } = await import("@/lib/player-link");
    const dns = normaliseDns(data.dns);
    if (dns === null) throw new Error("Enter a web address like http://example.com:8080");
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only the admin can change the DNS.");
    const { error } = await context.supabase.from("player_settings")
      .upsert({ id: 1, dns, updated_at: new Date().toISOString(), updated_by: context.userId });
    if (error) throw new Error(error.message);
    return { dns };
  });

/** Admin only: take every BM Player app offline with a message, or bring them back. */
export const savePlayerMaintenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean(), message: z.string().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only the admin can change maintenance mode.");
    const { error } = await context.supabase.from("player_settings")
      .update({ maintenance_enabled: data.enabled, maintenance_message: data.message.trim(), updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const savePlayerChannelAliases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ aliases: z.array(z.object({ from: z.string().trim().min(1).max(80), to: z.string().trim().min(1).max(80) })).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only the admin can change channel matching.");
    const { error } = await context.supabase.from("player_settings")
      .update({ channel_aliases: data.aliases, updated_at: new Date().toISOString(), updated_by: context.userId }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin test: ask the DNS whether it answers like an Xtream panel. */
export const testPlayerDns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dns: z.string().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { normaliseDns } = await import("@/lib/player-link");
    const dns = normaliseDns(data.dns);
    if (!dns) throw new Error("Enter a web address first.");
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only the admin can test the DNS.");
    try {
      const r = await fetch(`${dns}/player_api.php`, { signal: AbortSignal.timeout(8000) });
      return { reachable: true, status: r.status };
    } catch {
      return { reachable: false, status: 0 };
    }
  });

/** Admin issues a BM Player login to someone with no website account; they get their own account number. */
export const issueOffsitePlayerLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    customerName: z.string().trim().min(1, "Customer name is required").max(120),
    email: z.string().trim().email("A valid email is required").max(200),
    code: z.string().regex(/^\s*\d{3}\s*\d{3}\s*$/, "Enter the 6-digit code shown on the app"),
    expiresAt: z.string().datetime().nullable(),
    ...Creds,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admin can issue app logins.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await sha256Hex(normaliseLinkCode(data.code));
    const { data: row } = await supabaseAdmin.from("player_link_codes").select("device_id, expires_at, used_at").eq("code_hash", hash).maybeSingle();
    if (!linkCodeUsable(row)) throw new Error("That code is wrong or has expired. Ask the customer for the code on their screen.");
    const { data: device } = await supabaseAdmin.from("player_devices").select("id, user_id, offsite_customer_id").eq("id", row!.device_id).maybeSingle();
    if (!device) throw new Error("That device is no longer linked. Ask for a new code.");
    if (device.user_id || device.offsite_customer_id) throw new Error("This device is already linked to another account.");
    const { data: claimed } = await supabaseAdmin.from("player_link_codes").update({ used_at: new Date().toISOString() })
      .eq("code_hash", hash).is("used_at", null).select("device_id").maybeSingle();
    if (!claimed) throw new Error("That code has already been used. Ask for a new code.");
    const { data: issued, error } = await supabaseAdmin.rpc("issue_offsite_player_customer", {
      _name: data.customerName, _email: data.email, _username: data.username, _expires: data.expiresAt as string, _admin: context.userId,
    });
    const cust = Array.isArray(issued) ? issued[0] : issued;
    if (error || !cust) throw new Error("Could not create the account number. Try again.");
    await supabaseAdmin.from("player_devices").update({ offsite_customer_id: cust.id, linked_at: new Date().toISOString() }).eq("id", device.id);
    await supabaseAdmin.from("player_pending_credentials").upsert({ device_id: device.id, username: data.username, password: data.password, created_at: new Date().toISOString() });
    return { number: cust.number as number };
  });
