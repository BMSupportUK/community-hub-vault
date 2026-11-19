// VPNresellers (reseller VPN accounts) through the connector gateway. Server only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY = "https://connector-gateway.lovable.dev/udc_vpnresellers_3";

export async function vr<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const lk = process.env["LOVABLE_API_KEY"], ck = process.env["UDC_VPNRESELLERS_3_API_KEY"];
  if (!lk || !ck) throw new Error("VPNresellers is not connected");
  const r = await fetch(GATEWAY + path, {
    method,
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) { console.error(`VPNresellers ${method} ${path} [${r.status}]: ${text}`); throw new Error(`VPNresellers said ${r.status}: ${text.slice(0, 200)}`); }
  return (text ? JSON.parse(text) : {}) as T;
}

import { pickServer, vpnHomeCountry, type VpnServer } from "./vpn-pick-server";
export { pickServer, type VpnServer };
let serverCache: { at: number; list: VpnServer[] } | null = null;
export async function vpnServers(): Promise<VpnServer[]> {
  if (serverCache && Date.now() - serverCache.at < 60_000) return serverCache.list;
  const r = await vr<{ data: VpnServer[] }>("GET", "/servers");
  const list = (r.data ?? []).filter((s) => s.status === 1 && s.visible === 1);
  serverCache = { at: Date.now(), list };
  return list;
}

let balanceCache: { at: number; balance: string } | null = null;
export async function vpnBalance(): Promise<string> {
  if (balanceCache && Date.now() - balanceCache.at < 20_000) return balanceCache.balance;
  const r = await vr<{ data: { balance: string | number } }>("GET", "/profile");
  const balance = String(r.data?.balance ?? "0");
  balanceCache = { at: Date.now(), balance };
  return balance;
}

const rand = (n: number, set: string) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => set[b % set.length]).join("");
export function newVpnLogin() {
  return { username: "bm" + rand(10, "abcdefghjkmnpqrstuvwxyz23456789"), password: rand(20, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789") };
}

const ymd = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/** Provider accounts default to auto-renewal until a non-null expiry is set. */
export async function createFixedVpnAccount(login: { username: string; password: string }, until: string) {
  const expireAt = ymd(until);
  const made = await vr<{ data: { id: number } }>("POST", "/accounts", login);
  try {
    await vr("PUT", `/accounts/${made.data.id}/expire`, { expire_at: expireAt });
  } catch (error) {
    // Never expose an account whose fixed expiry was not accepted by the provider.
    await vr("PUT", `/accounts/${made.data.id}/disable`).catch(() => null);
    throw error;
  }
  return made;
}

/** Account-wide: one paid VPN on the account covers every linked BM Player. Checks this login first, then any other paid login on the same account. */
export async function vpnEntitlement(credentialId: string | null | undefined, userId?: string | null): Promise<{ until: string } | null> {
  const own = await credentialEntitlement(credentialId);
  if (own || !userId) return own;
  const { data: subs } = await supabaseAdmin.from("vpn_subscriptions").select("credential_id").eq("user_id", userId).eq("active", true).neq("credential_id", credentialId ?? "00000000-0000-0000-0000-000000000000");
  let best: { until: string } | null = null;
  for (const s of subs ?? []) {
    const e = await credentialEntitlement(s.credential_id as string).catch(() => null);
    if (e && (!best || e.until > best.until)) best = e;
  }
  return best;
}

async function credentialEntitlement(credentialId: string | null | undefined): Promise<{ until: string } | null> {
  if (!credentialId) return null;
  const [{ data: sub }, { data: cred, error: expiryError }] = await Promise.all([
    supabaseAdmin.from("vpn_subscriptions").select("active, source, paid_until").eq("credential_id", credentialId).maybeSingle(),
    supabaseAdmin.rpc("vpn_credential_expiry", { p_credential: credentialId }).maybeSingle(),
  ]);
  if (expiryError) throw new Error("Could not read VPN subscription expiry");
  if (!cred) return null;
  if (!sub?.active) return null;
  // Logins with no end date saved (e.g. owner/test lines) keep an admin-allocated VPN on a rolling year.
  if (!cred?.expiry_at) return sub.source === "admin" ? { until: new Date(Date.now() + 365 * 864e5).toISOString() } : null;
  if (new Date(cred.expiry_at).getTime() <= Date.now()) return null;
  // Bought in BM Player: paid up to the subscription end at the time, never carried past it by a renewal.
  if (sub.paid_until) {
    const paid = new Date(sub.paid_until).getTime();
    if (paid <= Date.now()) return null;
    return { until: paid < new Date(cred.expiry_at).getTime() ? sub.paid_until : cred.expiry_at };
  }
  return { until: cred.expiry_at };
}

type Account = { id: string; vpnr_account_id: number; enabled: boolean; remote_active: boolean; expire_at: string | null; server_id: number | null; server_name: string | null; credential_id: string };

/** Keeps the VPNresellers account switched on/off and ending on the subscription's end date. */
export async function syncRemote(acc: Account, until: string | null) {
  const patch: Record<string, unknown> = {};
  if (!until) {
    if (acc.remote_active) { await vr("PUT", `/accounts/${acc.vpnr_account_id}/disable`); patch.remote_active = false; }
  } else {
    const d = ymd(until);
    if (acc.expire_at !== d) { await vr("PUT", `/accounts/${acc.vpnr_account_id}/expire`, { expire_at: d }); patch.expire_at = d; }
    if (!acc.remote_active) { await vr("PUT", `/accounts/${acc.vpnr_account_id}/enable`); patch.remote_active = true; }
  }
  if (Object.keys(patch).length) await supabaseAdmin.from("vpn_accounts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", acc.id);
  return { ...acc, ...patch } as Account;
}

const SEL = "id, vpnr_account_id, enabled, remote_active, expire_at, server_id, server_name, credential_id";
const configCache = new Map<string, { at: number; config: string }>();

/** What the box needs: nothing (no VPN paid), off, or a ready WireGuard setup. */
export async function boxVpn(device: { id: string; user_id: string | null; geo_country?: string | null }) {
  const { data: dev } = await supabaseAdmin.from("player_devices").select("credential_id").eq("id", device.id).maybeSingle();
  const credentialId = dev?.credential_id ?? null;
  const ent = await vpnEntitlement(credentialId, device.user_id);
  let { data: acc } = await supabaseAdmin.from("vpn_accounts").select(SEL).eq("device_id", device.id).maybeSingle();
  if (!ent || !device.user_id || !credentialId) {
    if (acc) await syncRemote(acc as Account, null).catch(() => null);
    return { vpn: null, offer: "buy" };
  }
  if (!acc) {
    // One VPN connection per account: if another linked device holds it, the customer moves it from the website.
    // One connection per VPN bought (Multi Room 2, Triple Room 3): every one in use on other devices → move one from the website.
    const [held, slots] = await Promise.all([vpnHolders(device.user_id), vpnSlots(device.user_id)]);
    if (held.length >= slots) return { vpn: null, offer: "elsewhere" };
    const { data: freeRow } = await supabaseAdmin.from("vpn_accounts").select(SEL).eq("user_id", device.user_id).is("device_id", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (freeRow) { await supabaseAdmin.from("vpn_accounts").update({ device_id: device.id, enabled: false }).eq("id", freeRow.id); acc = { ...freeRow, enabled: false }; }
  }
  if (!acc) {
    // An admin-allocated login for this subscriber not yet on a box is used first.
    const { data: spare } = await supabaseAdmin.from("vpn_accounts").select(SEL).eq("credential_id", credentialId).is("device_id", null).limit(1).maybeSingle();
    if (spare) {
      await supabaseAdmin.from("vpn_accounts").update({ device_id: device.id }).eq("id", spare.id);
      acc = spare;
    } else {
      const login = newVpnLogin();
      const made = await createFixedVpnAccount(login, ent.until);
      const { lockVpnCreds } = await import("./box-vpn.server");
      const { data: row, error } = await supabaseAdmin.from("vpn_accounts").insert({
        credential_id: credentialId, user_id: device.user_id, device_id: device.id, vpnr_account_id: made.data.id,
        username: login.username, cred_cipher: await lockVpnCreds(login.username, login.password), source: "auto",
      }).select(SEL).single();
      if (error || !row) throw new Error("Could not save the VPN login");
      acc = row;
    }
  }
  const a = await syncRemote(acc as Account, ent.until);
  if (!a.enabled) return { vpn: { enabled: false, until: ent.until } };
  let serverId = a.server_id, serverName = a.server_name;
  if (!serverId) {
    const { data: used } = await supabaseAdmin.from("vpn_accounts").select("server_id").eq("enabled", true).not("server_id", "is", null);
    const ours: Record<number, number> = {};
    for (const u of used ?? []) ours[u.server_id as number] = (ours[u.server_id as number] ?? 0) + 1;
    const s = pickServer(await vpnServers(), vpnHomeCountry(device as never), ours);
    if (!s) return { vpn: { enabled: true, error: "No VPN servers available" } };
    serverId = s.id; serverName = `${s.city} (${s.country_code})`;
    await supabaseAdmin.from("vpn_accounts").update({ server_id: serverId, server_name: serverName }).eq("id", a.id);
  }
  const key = `${a.vpnr_account_id}:${serverId}`;
  let cfg = configCache.get(key);
  if (!cfg || Date.now() - cfg.at > 30 * 60_000) {
    const r = await vr<{ data: { content: string } }>("GET", `/configuration/wireguard?server_id=${serverId}&account_id=${a.vpnr_account_id}`);
    cfg = { at: Date.now(), config: r.data.content };
    configCache.set(key, cfg);
  }
  return { vpn: { enabled: true, server: serverName, server_id: serverId, until: ent.until, config: cfg.config } };
}

/** Devices on this account currently holding one of its VPN connections. */
export async function vpnHolders(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from("vpn_accounts").select("device_id").eq("user_id", userId).not("device_id", "is", null);
  return (data ?? []).map((r) => r.device_id as string);
}

/** VPN connections paid for on this account right now (one per VPN bought; admin/order VPNs count as 1). */
export async function vpnSlots(userId: string): Promise<number> {
  const { data: subs } = await supabaseAdmin.from("vpn_subscriptions").select("credential_id, slots").eq("user_id", userId).eq("active", true);
  let n = 0;
  for (const s of subs ?? []) if (await credentialEntitlement(s.credential_id as string).catch(() => null)) n += Math.max(1, Number(s.slots) || 1);
  return n;
}

/** VPNs the account may own: 1 for a single package, 2 for Multi Room, 3 for Triple Room. */
export async function vpnRooms(userId: string): Promise<number> {
  const { data } = await supabaseAdmin.from("player_devices").select("iptv_username").eq("user_id", userId).not("iptv_username", "is", null).limit(20);
  const logins = [...new Set((data ?? []).map((d) => String(d.iptv_username)))];
  const { loginConnections } = await import("./player-connections.server");
  let best = 1;
  for (const l of logins) best = Math.max(best, (await loginConnections(supabaseAdmin, l).catch(() => null)) ?? 1);
  return Math.min(best, 3);
}

/** Take the VPN off a device so its connection can be used on another linked device. */
export async function vpnRelease(userId: string, deviceId: string) {
  const { error } = await supabaseAdmin.from("vpn_accounts").update({ device_id: null, enabled: false, server_id: null, server_name: null, status: "off", status_detail: null, updated_at: new Date().toISOString() } as never).eq("user_id", userId).eq("device_id", deviceId);
  return error ? { error: "Couldn't remove the VPN. Try again shortly." } : { ok: true as const };
}

/** Put a free VPN connection on this device. Arrives switched off; the customer turns it on in BM Player. */
export async function vpnAssign(userId: string, deviceId: string) {
  const [held, slots] = await Promise.all([vpnHolders(userId), vpnSlots(userId)]);
  if (held.includes(deviceId)) return { ok: true as const };
  if (held.length >= slots) return { error: "All your VPNs are in use. Remove one from another device first." };
  const { data: free } = await supabaseAdmin.from("vpn_accounts").select("id").eq("user_id", userId).is("device_id", null).limit(1).maybeSingle();
  if (free) {
    const { error } = await supabaseAdmin.from("vpn_accounts").update({ device_id: deviceId, enabled: false, updated_at: new Date().toISOString() } as never).eq("id", free.id);
    if (error) return { error: "Couldn't add the VPN. Try again shortly." };
  }
  return { ok: true as const };
}
