// Locks VPN sign-in details so only the box (through the server) can read them back.
async function key() {
  const raw = new TextEncoder().encode(process.env["VPN_CRED_KEY"] ?? "");
  if (raw.length < 32) throw new Error("VPN key missing");
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function lockVpnCreds(username: string, password: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(JSON.stringify({ u: username, p: password }))));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function unlockVpnCreds(cipher: string): Promise<{ username: string; password: string }> {
  const [iv, ct] = cipher.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct));
  const o = JSON.parse(new TextDecoder().decode(pt)) as { u: string; p: string };
  return { username: o.u, password: o.p };
}

type Provider = { id: string; picker: string; auth_kind: string };
type Place = { cc?: string | null; city?: string | null };

/** Builds this box's WireGuard setup: closest, least busy server for token/key providers; the customer's own file otherwise. */
export async function buildBoxVpn(provider: Provider, secret: string, place: Place, avoid?: string | null): Promise<{ server: string; config: string; load: number | null } | { error: string }> {
  const { pickBestServer, wgConfig, checkWgFile, NORD_COUNTRY } = await import("./vpn-picker");
  const cc = (place.cc ?? "gb").toLowerCase();
  if (provider.auth_kind === "wg_config") {
    const f = checkWgFile(secret);
    return f.ok ? { server: f.server, config: secret, load: null } : { error: f.error };
  }
  try {
    if (provider.auth_kind === "nord_token") {
      const cr = await fetch("https://api.nordvpn.com/v1/users/services/credentials", { headers: { Authorization: `Basic ${btoa(`token:${secret}`)}` } });
      if (!cr.ok) return { error: "NordVPN did not accept the access token. Make a new one and send it again." };
      const privateKey = ((await cr.json()) as { nordlynx_private_key?: string }).nordlynx_private_key;
      if (!privateKey) return { error: "NordVPN did not return a key for this account." };
      const id = NORD_COUNTRY[cc] ?? NORD_COUNTRY.gb;
      const r = await fetch(`https://api.nordvpn.com/v1/servers/recommendations?filters[servers_technologies][identifier]=wireguard_udp&filters[country_id]=${id}&limit=25`);
      type S = { hostname: string; station: string; load: number; locations?: { country?: { code?: string; city?: { name?: string } } }[]; technologies?: { identifier: string; metadata?: { name: string; value: string }[] }[] };
      const list = (await r.json()) as S[];
      const keyOf = (s: S) => s.technologies?.find((t) => t.identifier === "wireguard_udp")?.metadata?.find((m) => m.name === "public_key")?.value;
      const usable = list.filter((s) => s.hostname !== avoid && keyOf(s));
      const best = pickBestServer(usable.map((s) => ({ host: s.hostname, load: s.load, cc: s.locations?.[0]?.country?.code ?? cc, city: s.locations?.[0]?.country?.city?.name })), place);
      const s = best && usable.find((x) => x.hostname === best.host);
      if (!s) return { error: "No NordVPN server found near you." };
      return { server: s.hostname, load: s.load, config: wgConfig({ privateKey, address: "10.5.0.2/32", dns: "103.86.96.100", publicKey: keyOf(s)!, endpoint: `${s.station}:51820` }) };
    }
    if (provider.auth_kind === "private_key") {
      const r = await fetch("https://api.surfshark.com/v4/server/clusters/generic");
      const list = ((await r.json()) as { connectionName: string; load: number; countryCode: string; location: string; pubKey?: string }[]).filter((s) => s.pubKey && s.connectionName !== avoid);
      const best = pickBestServer(list.map((s) => ({ host: s.connectionName, load: s.load, cc: s.countryCode, city: s.location })), place);
      const s = best && list.find((x) => x.connectionName === best.host);
      if (!s) return { error: "No Surfshark server found near you." };
      return { server: s.connectionName, load: s.load, config: wgConfig({ privateKey: secret.trim(), address: "10.14.0.2/16", dns: "162.252.172.57", publicKey: s.pubKey!, endpoint: `${s.connectionName}:51820` }) };
    }
  } catch { return { error: "The VPN provider could not be reached. The box will try again." }; }
  return { error: "This provider isn't set up yet." };
}
