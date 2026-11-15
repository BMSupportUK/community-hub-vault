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

/** Asks the provider for its servers and picks the closest, least busy one for this box's area. */
export async function chooseVpnServer(provider: { id: string; picker: string; host_template: string | null }, place: { cc?: string | null; city?: string | null }, avoid?: string | null) {
  const { pickBestServer, hostFromTemplate, NORD_COUNTRY } = await import("./vpn-picker");
  const cc = (place.cc ?? "gb").toLowerCase();
  try {
    if (provider.picker === "nordvpn") {
      const id = NORD_COUNTRY[cc] ?? NORD_COUNTRY.gb;
      const r = await fetch(`https://api.nordvpn.com/v1/servers/recommendations?filters[servers_technologies][identifier]=openvpn_udp&filters[country_id]=${id}&limit=20`);
      const list = (await r.json()) as { hostname: string; load: number; locations?: { country?: { code?: string; city?: { name?: string } } }[] }[];
      const best = pickBestServer(list.filter((s) => s.hostname !== avoid).map((s) => ({ host: s.hostname, load: s.load, cc: s.locations?.[0]?.country?.code ?? cc, city: s.locations?.[0]?.country?.city?.name })), place);
      if (best) return { host: best.host, load: best.load ?? null, config_url: `https://downloads.nordcdn.com/configs/files/ovpn_udp/servers/${best.host}.udp.ovpn` };
    }
    if (provider.picker === "surfshark") {
      const r = await fetch("https://api.surfshark.com/v4/server/clusters/generic");
      const list = (await r.json()) as { connectionName: string; load: number; countryCode: string; location: string }[];
      const best = pickBestServer(list.filter((s) => s.connectionName !== avoid).map((s) => ({ host: s.connectionName, load: s.load, cc: s.countryCode, city: s.location })), place);
      if (best) return { host: best.host, load: best.load ?? null, config_url: null };
    }
  } catch { /* provider list unreachable: fall back to the provider's own nearest address */ }
  const template = provider.host_template ?? (provider.picker === "protonvpn" ? "node-{cc}-01.protonvpn.net" : null);
  return template ? { host: hostFromTemplate(template, place), load: null, config_url: null } : null;
}
