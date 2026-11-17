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

const rand = (n: number, set: string) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => set[b % set.length]).join("");
export function newVpnLogin() {
  return { username: "bm" + rand(10, "abcdefghjkmnpqrstuvwxyz23456789"), password: rand(20, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789") };
}

const ymd = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/** Is this login paid up for the VPN right now? Returns the end date when it is. */
export async function vpnEntitlement(credentialId: string | null | undefined): Promise<{ until: string } | null> {
  if (!credentialId) return null;
  const [{ data: sub }, { data: cred }] = await Promise.all([
    supabaseAdmin.from("vpn_subscriptions").select("active, source").eq("credential_id", credentialId).maybeSingle(),
    supabaseAdmin.from("app_credentials").select("expiry_at").eq("id", credentialId).maybeSingle(),
  ]);
  if (!sub?.active) return null;
  // Logins with no end date saved (e.g. owner/test lines) keep an admin-allocated VPN on a rolling year.
  if (!cred?.expiry_at) return sub.source === "admin" ? { until: new Date(Date.now() + 365 * 864e5).toISOString() } : null;
  if (new Date(cred.expiry_at).getTime() <= Date.now()) return null;
  return { until: cred.expiry_at };
}

type Account = { id: string; vpnr_account_id: number; enabled: boolean; remote_active: boolean; expire_at: string | null; server_id: number | null; server_name: string | null; credential_id: string };

/** Keeps the VPNresellers account switched on/off and ending on the subscription's end date. */
export async function syncRemote(acc: Account, until: string | null) {
  const patch: Record<string, unknown> = {};
  if (!until) {
    if (acc.remote_active) { await vr("PUT", `/accounts/${acc.vpnr_account_id}/disable`); patch.remote_active = false; }
  } else {
    if (!acc.remote_active) { await vr("PUT", `/accounts/${acc.vpnr_account_id}/enable`); patch.remote_active = true; }
    const d = ymd(until);
    if (acc.expire_at !== d) { await vr("PUT", `/accounts/${acc.vpnr_account_id}/expire`, { expire_at: d }); patch.expire_at = d; }
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
  const ent = await vpnEntitlement(credentialId);
  let { data: acc } = await supabaseAdmin.from("vpn_accounts").select(SEL).eq("device_id", device.id).maybeSingle();
  if (!ent || !device.user_id || !credentialId) {
    if (acc) await syncRemote(acc as Account, null).catch(() => null);
    return { vpn: null, offer: "Add VPN to your next order" };
  }
  if (!acc) {
    // An admin-allocated login for this subscriber not yet on a box is used first.
    const { data: spare } = await supabaseAdmin.from("vpn_accounts").select(SEL).eq("credential_id", credentialId).is("device_id", null).limit(1).maybeSingle();
    if (spare) {
      await supabaseAdmin.from("vpn_accounts").update({ device_id: device.id }).eq("id", spare.id);
      acc = spare;
    } else {
      const login = newVpnLogin();
      const made = await vr<{ data: { id: number } }>("POST", "/accounts", { username: login.username, password: login.password });
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
