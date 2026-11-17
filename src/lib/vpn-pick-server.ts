export type VpnServer = { id: number; name: string; country_code: string; city: string; status: number; visible: number; cpu?: number };

/**
 * Compare VPNresellers' raw live "cpu" traffic figures, never a guessed 0–100 scale.
 * The API does not document the unit; do not label these figures as bytes or percent.
 * A nearby country's server is only used when it carries at most this share of the
 * best home server's traffic, so small differences never pull a box abroad.
 */
export const VPN_NEARBY_SHARE = 0.5;
const NEARBY = ["GB", "UK", "IE", "NL", "BE", "FR", "DE"];

const load = (s: VpnServer) => typeof s.cpu === "number" && Number.isFinite(s.cpu) && s.cpu >= 0 ? s.cpu : Infinity;
const byLoad = (ours: Record<number, number>) => (a: VpnServer, b: VpnServer) =>
  load(a) - load(b) || (ours[a.id] ?? 0) - (ours[b.id] ?? 0);

/** Public picker data: raw readings, lowest first; bars compare this list, not capacity. */
export function serverTrafficList(list: VpnServer[], cc?: string | null) {
  // With the box's country known: home country first, then nearby countries, far-away ones last
  // (a quiet server abroad still streams worse than a busier one close by); traffic sorts within each.
  const want = [(cc ?? "").toUpperCase(), ...NEARBY].filter(Boolean);
  const rank = (s: VpnServer) => {
    if (!cc) return 0;
    const c = s.country_code?.toUpperCase() ?? "";
    return c === want[0] || (want[0] === "GB" && c === "UK") ? 0 : want.includes(c) ? 1 : 2;
  };
  const sorted = [...list].sort((a, b) => rank(a) - rank(b) || load(a) - load(b) || a.id - b.id);
  const maximum = Math.max(0, ...sorted.map(s => Number.isFinite(load(s)) ? load(s) : 0));
  return sorted.map(s => ({
    id: s.id, country: s.country_code, city: s.city,
    traffic: Number.isFinite(load(s)) ? load(s) : null,
    traffic_bar: Number.isFinite(load(s)) ? (maximum > 0 ? Math.round(load(s) / maximum * 100) : 0) : null,
  }));
}

/**
 * The box's own country first (then UK); within it the server with the least traffic,
 * then the fewest of our customers. A nearby country's server is used instead when it
 * has half the traffic or less.
 */
export function pickServer(list: VpnServer[], cc?: string | null, ours: Record<number, number> = {}): VpnServer | null {
  const want = [(cc ?? "").toUpperCase(), ...NEARBY].filter(Boolean);
  const sort = byLoad(ours);
  for (const c of want) {
    const inC = list.filter((s) => s.country_code?.toUpperCase() === c).sort(sort);
    if (!inC.length) continue;
    const home = inC[0];
    const near = list.filter((s) => want.includes(s.country_code?.toUpperCase()) && s.country_code?.toUpperCase() !== c).sort(sort)[0];
    return near && Number.isFinite(load(near)) && load(near) <= load(home) * VPN_NEARBY_SHARE ? near : home;
  }
  return list[0] ?? null;
}

/** The box's real country for VPN choices: while on our VPN its check-in country is the VPN exit, so fall back to the UK. */
export function vpnHomeCountry(device: { geo_country?: string | null; vpn_status?: string | null }): string {
  return device.vpn_status === "yes" || !device.geo_country ? "GB" : device.geo_country.toUpperCase();
}
