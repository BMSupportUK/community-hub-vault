import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// The 4-digit BM Player PIN is retired: 2FA (authenticator app) is the only unlock, with 10 one-use backup codes.

async function requireAdminOrManagement(context: { supabase: any; userId: string }) {
  const [a, m] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "management" }),
  ]);
  if (!a.data && !m.data) throw new Error("Forbidden");
}

/** Check the signed-in user's own account password with an isolated, non-persistent client (app session untouched). */
async function passwordMatches(context: { supabase: any; userId: string }, password: string): Promise<boolean> {
  const { data: current } = await context.supabase.auth.getUser();
  if (!current?.user?.email || current.user.id !== context.userId) throw new Error("Please sign out and sign in again.");
  const url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Password checking is unavailable. Please try again.");
  const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: r, error } = await verifier.auth.signInWithPassword({ email: current.user.email, password });
  if (r.session) await verifier.auth.signOut({ scope: "local" });
  if (error && error.code !== "invalid_credentials") throw new Error("Couldn't check your password. Please try again shortly.");
  return !error && r.user?.id === context.userId;
}

/** Customer's BM Player 2FA state. */
export const getMyPlayerUnlock = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("player_totp").select("enabled").eq("owner_id", context.userId).maybeSingle();
  return { method: data?.enabled ? ("totp" as const) : ("none" as const) };
});

/** Step 1 of turning on the authenticator: make a new secret and QR code (not active until confirmed). */
export const startPlayerTotp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { newTotpSecret, totpUrl } = await import("@/lib/player-totp");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cur } = await supabaseAdmin.from("player_totp").select("enabled").eq("owner_id", context.userId).maybeSingle();
  if (cur?.enabled) throw new Error("2FA is already on.");
  const secret = newTotpSecret();
  const { data: p } = await supabaseAdmin.from("profiles").select("username").eq("id", context.userId).maybeSingle();
  const { error } = await supabaseAdmin.from("player_totp").upsert({ owner_id: context.userId, pending_secret: secret, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
  if (error) throw new Error("Couldn't start set up. Try again.");
  const url = totpUrl(secret, (p as { username?: string } | null)?.username ?? "BM Support");
  const QR = await import("qrcode");
  return { secret, qrSvg: await QR.toString(url, { type: "svg", margin: 1, width: 200 }) };
});

/** Step 2: confirm a code from the app; 10 backup codes are made and kept in Security settings. */
export const confirmPlayerTotp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ code: z.string().regex(/^\d{6}$/) }))
  .handler(async ({ data, context }) => {
    const { totpMatches } = await import("@/lib/player-totp");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("player_totp").select("pending_secret").eq("owner_id", context.userId).maybeSingle();
    if (!row?.pending_secret) return { ok: false as const, error: "Start set up again." };
    if (!(await totpMatches(row.pending_secret, data.code))) return { ok: false as const, error: "That code isn't right. Check the time on your phone and try the newest code." };
    await supabaseAdmin.from("player_totp").update({ secret: row.pending_secret, pending_secret: null, enabled: true, updated_at: new Date().toISOString() }).eq("owner_id", context.userId);
    await supabaseAdmin.from("player_devices").update({ totp_passed_at: null, pin_failures: 0, pin_locked_until: null, pin_lock_level: 0 }).eq("user_id", context.userId);
    const { issueBackupCodes } = await import("@/lib/player-backup-codes");
    await issueBackupCodes(supabaseAdmin, { owner_id: context.userId });
    return { ok: true as const };
  });

/** Show the backup codes — only after the account password is confirmed. `renew` replaces all 10 with new ones. */
export const revealPlayerBackupCodes = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ password: z.string().min(1).max(4096), renew: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    if (!(await passwordMatches(context, data.password))) return { ok: false as const, error: "That password isn't right." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin.from("player_totp").select("enabled").eq("owner_id", context.userId).maybeSingle();
    if (!t?.enabled) return { ok: false as const, error: "Turn on BM Player 2FA first — backup codes are made when it is switched on." };
    const { issueBackupCodes } = await import("@/lib/player-backup-codes");
    const { data: rows } = await supabaseAdmin.from("player_backup_codes").select("code, used_at, created_at").eq("owner_id", context.userId).order("code");
    if (data.renew || !rows?.length) {
      const codes = await issueBackupCodes(supabaseAdmin, { owner_id: context.userId });
      return { ok: true as const, codes: codes.map((code) => ({ code, used: false })) };
    }
    return { ok: true as const, codes: rows.map((r) => ({ code: r.code, used: !!r.used_at })) };
  });

/** Admin/management: is BM Player 2FA on for this customer? */
export const adminPlayerPinStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await requireAdminOrManagement(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("player_totp").select("enabled").eq("owner_id", data.userId).maybeSingle();
    return { set: !!row?.enabled };
  });

/** Admin/management only: reset a customer's 2FA (e.g. lost phone); their boxes ask them to set it up again. */
export const disablePlayerTotp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await requireAdminOrManagement(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("player_totp").delete().eq("owner_id", data.userId);
    await supabaseAdmin.from("player_backup_codes").delete().eq("owner_id", data.userId);
    await supabaseAdmin.from("player_devices").update({ totp_passed_at: null }).eq("user_id", data.userId);
    return { ok: true as const };
  });
