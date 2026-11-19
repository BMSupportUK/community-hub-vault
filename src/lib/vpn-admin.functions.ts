import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function staffOnly(context: { supabase: any; userId: string }) {
  const [{ data: a }, { data: m }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "management" }),
  ]);
  if (!a && !m) throw new Error("Only admin and management can manage the VPN");
}

/** Everything on the dashboard VPN page. Passwords never leave the server. */
export const vpnOverview = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await staffOnly(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: subs }, { data: accs }] = await Promise.all([
    supabaseAdmin.from("vpn_subscriptions").select("credential_id, user_id, active, source, updated_at"),
    supabaseAdmin.from("vpn_accounts").select("id, credential_id, device_id, username, server_id, server_name, enabled, remote_active, expire_at, status, status_detail, source, updated_at"),
  ]);
  const credIds = [...new Set([...(subs ?? []).map((s) => s.credential_id), ...(accs ?? []).map((a) => a.credential_id)])];
  const devIds = (accs ?? []).map((a) => a.device_id).filter(Boolean) as string[];
  const [{ data: creds }, { data: devs }] = await Promise.all([
    Promise.all(credIds.map(async (id) => {
      const { data, error } = await context.supabase.rpc("admin_vpn_subscriber_lookup", { p_credential_id: id });
      if (error) throw new Error(error.message);
      return data?.[0];
    })).then((rows) => ({ data: rows.filter(Boolean) })),
    devIds.length ? supabaseAdmin.from("player_devices").select("id, name, platform").in("id", devIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const credMap = new Map((creds ?? []).map((c: any) => [c.id, c]));
  const devMap = new Map((devs ?? []).map((d: any) => [d.id, d]));
  return {
    subscribers: (subs ?? []).map((s) => ({ ...s, login: credMap.get(s.credential_id)?.app_login_name ?? "?", expiry_at: credMap.get(s.credential_id)?.expiry_at ?? null,
      accounts: (accs ?? []).filter((a) => a.credential_id === s.credential_id).map((a) => ({ ...a, device: a.device_id ? devMap.get(a.device_id)?.name ?? devMap.get(a.device_id)?.platform ?? "Box" : null })) })),
  };
});

/** VPNresellers account credit balance for the admin dashboard header. */
export const vpnCredits = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await staffOnly(context);
  const { vpnBalance } = await import("./vpnresellers.server");
  return { balance: await vpnBalance() };
});

export const vpnServerList = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await staffOnly(context);
  const { vpnServers } = await import("./vpnresellers.server");
  return (await vpnServers()).map((s) => ({ id: s.id, label: `${s.city} (${s.country_code})` })).sort((a, b) => a.label.localeCompare(b.label));
});

export const findSubscribers = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { q: string }) => z.object({ q: z.string().trim().min(2).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    await staffOnly(context);
    const { data: rows, error } = await context.supabase.rpc("admin_vpn_subscriber_lookup", { p_query: data.q });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Attach a VPNresellers login you already have (or a brand new one) to a subscriber. */
export const allocateVpn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ credentialId: z.string().uuid(), username: z.string().trim().max(50).optional(), password: z.string().max(50).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await staffOnly(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { vr, newVpnLogin, vpnEntitlement, syncRemote } = await import("./vpnresellers.server");
    const { lockVpnCreds } = await import("./box-vpn.server");
    const { data: credentials, error: credentialError } = await context.supabase.rpc("admin_vpn_subscriber_lookup", { p_credential_id: data.credentialId });
    if (credentialError) throw new Error(credentialError.message);
    const cred = credentials?.[0];
    if (!cred?.owner_id) return { ok: false, error: "That subscriber login wasn't found." };
    let accountId: number, username: string, password: string;
    if (data.username) {
      username = data.username; password = data.password ?? "";
      if (password.length < 6) return { ok: false, error: "Enter that VPN login's password (at least 6 characters)." };
      let found: { id: number } | undefined;
      for (let page = 1; page <= 40 && !found; page++) {
        const r = await vr<{ data: { id: number; username: string }[]; links?: { next: string | null } }>("GET", `/accounts?per_page=100&page=${page}`);
        found = r.data.find((a) => a.username.toLowerCase() === username.toLowerCase());
        if (!r.links?.next) break;
      }
      if (!found) return { ok: false, error: `No VPNresellers login called ${username} was found.` };
      const { data: taken } = await supabaseAdmin.from("vpn_accounts").select("id").eq("vpnr_account_id", found.id).maybeSingle();
      if (taken) return { ok: false, error: "That VPN login is already allocated." };
      accountId = found.id;
    } else {
      const l = newVpnLogin(); username = l.username; password = l.password;
      accountId = (await vr<{ data: { id: number } }>("POST", "/accounts", { username, password })).data.id;
    }
    await supabaseAdmin.from("vpn_subscriptions").upsert({ credential_id: cred.id, user_id: cred.owner_id, active: true, source: "admin", paid_until: null, updated_at: new Date().toISOString() });
    const { data: row } = await supabaseAdmin.from("vpn_accounts").insert({ credential_id: cred.id, user_id: cred.owner_id, vpnr_account_id: accountId, username, cred_cipher: await lockVpnCreds(username, password), source: "allocated" })
      .select("id, vpnr_account_id, enabled, remote_active, expire_at, server_id, server_name, credential_id").single();
    if (row) await syncRemote(row as any, (await vpnEntitlement(cred.id))?.until ?? null).catch(() => null);
    return { ok: true };
  });

/** Switch a subscriber's VPN on or off (off also switches their VPNresellers logins off). */
export const setVpnSubscription = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ credentialId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await staffOnly(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncRemote, vpnEntitlement } = await import("./vpnresellers.server");
    await supabaseAdmin.from("vpn_subscriptions").update({ active: data.active, updated_at: new Date().toISOString() }).eq("credential_id", data.credentialId);
    const until = (await vpnEntitlement(data.credentialId))?.until ?? null;
    const { data: accs } = await supabaseAdmin.from("vpn_accounts").select("id, vpnr_account_id, enabled, remote_active, expire_at, server_id, server_name, credential_id").eq("credential_id", data.credentialId);
    for (const a of accs ?? []) await syncRemote(a as any, until).catch(() => null);
    return { ok: true };
  });

/** One box's VPN: on/off, server (null = best), or a new password. */
export const updateVpnAccount = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), enabled: z.boolean().optional(), serverId: z.number().int().positive().nullable().optional(), newPassword: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await staffOnly(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { vr, vpnServers, newVpnLogin } = await import("./vpnresellers.server");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.serverId === null) { patch.server_id = null; patch.server_name = null; }
    else if (data.serverId) {
      const s = (await vpnServers()).find((x) => x.id === data.serverId);
      if (!s) return { ok: false, error: "That server isn't available." };
      patch.server_id = s.id; patch.server_name = `${s.city} (${s.country_code})`;
    }
    if (data.newPassword) {
      const { data: a } = await supabaseAdmin.from("vpn_accounts").select("vpnr_account_id, username").eq("id", data.id).single();
      const pw = newVpnLogin().password;
      await vr("PUT", `/accounts/${a!.vpnr_account_id}/change_password`, { password: pw });
      const { lockVpnCreds } = await import("./box-vpn.server");
      patch.cred_cipher = await lockVpnCreds(a!.username, pw);
    }
    await supabaseAdmin.from("vpn_accounts").update(patch as never).eq("id", data.id);
    return { ok: true };
  });
