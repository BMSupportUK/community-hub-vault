export type VpnServer = { id: number; name: string; country_code: string; city: string; status: number; visible: number; cpu?: number; ip?: string };

/**
 * Compare VPNresellers' raw live "cpu" traffic figures, never a guessed 0–100 scale.
 * The API does not document the unit; do not label these figures as bytes or percent.
 * A nearby country's server is only used when it carries at most this share of the
 * best home server's traffic, so small differences never pull a box abroad.
 */
export const VPN_NEARBY_SHARE = 0.5;
/** Rough country centres (lat, lon) so "nearby" means near the customer, not near the UK. */
const PLACE: Record<string, [number, number]> = {
  GB: [54, -2], IE: [53, -8], NL: [52, 5], BE: [50.6, 4.6], FR: [46.5, 2.5], DE: [51, 10], LU: [49.8, 6.1], CH: [46.8, 8.2], AT: [47.5, 14.5],
  ES: [40, -4], PT: [39.5, -8], IT: [42.8, 12.5], DK: [56, 10], NO: [61, 9], SE: [62, 15], FI: [64, 26], IS: [65, -18], PL: [52, 19.5],
  CZ: [49.8, 15.5], SK: [48.7, 19.7], HU: [47.2, 19.5], RO: [46, 25], BG: [42.7, 25.5], GR: [39, 22], HR: [45.1, 15.2], RS: [44, 21],
  SI: [46.1, 14.8], EE: [58.7, 25.5], LV: [57, 25], LT: [55.2, 23.9], UA: [49, 32], MD: [47, 28.5], CY: [35, 33], MT: [35.9, 14.4],
  TR: [39, 35], IL: [31.5, 34.9], AE: [24, 54], SA: [24, 45], EG: [27, 30], ZA: [-29, 24], NG: [9, 8], KE: [0, 38], MA: [32, -6],
  US: [39, -98], CA: [56, -106], MX: [23, -102], BR: [-10, -55], AR: [-34, -64], CL: [-30, -71], CO: [4, -72], PE: [-10, -76],
  AU: [-25, 134], NZ: [-41, 174], JP: [36, 138], KR: [36, 128], CN: [35, 105], HK: [22.3, 114.2], TW: [23.7, 121], SG: [1.35, 103.8],
  MY: [4, 102], TH: [15, 101], VN: [16, 107], PH: [13, 122], ID: [-2, 118], IN: [21, 78], PK: [30, 70], RU: [56, 38],
};
const code = (c?: string | null) => { const u = (c ?? "").toUpperCase(); return u === "UK" ? "GB" : u; };
function km(a: string, b: string): number {
  const p = PLACE[a], q = PLACE[b];
  if (!p || !q) return Infinity;
  const r = Math.PI / 180, x = Math.sin((q[0] - p[0]) * r / 2) ** 2 + Math.cos(p[0] * r) * Math.cos(q[0] * r) * Math.sin((q[1] - p[1]) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}
/** Countries counted as nearby: within this distance; only a home with no servers of its own widens to its three closest. */
export const VPN_NEARBY_KM = 1200;
function nearbyOf(home: string, list: VpnServer[], widen = false): string[] {
  const have = [...new Set(list.map(s => code(s.country_code)))].filter(c => c && c !== home);
  const byDist = have.map(c => [c, km(home, c)] as const).filter(([, d]) => Number.isFinite(d)).sort((a, b) => a[1] - b[1]);
  const close = byDist.filter(([, d]) => d <= VPN_NEARBY_KM).map(([c]) => c);
  return close.length || !widen ? close : byDist.slice(0, 3).map(([c]) => c);
}
/** Home country, nearby countries, then (if home has no servers and nothing is near) the UK. */
function wanted(cc: string | null | undefined, list: VpnServer[]): string[] {
  const home = code(cc) || "GB";
  const homeHas = list.some(s => code(s.country_code) === home);
  const w = [home, ...nearbyOf(home, list, !homeHas)];
  return w.includes("GB") ? w : [...w, "GB", ...nearbyOf("GB", list).filter(c => !w.includes(c))];
}

const load = (s: VpnServer) => typeof s.cpu === "number" && Number.isFinite(s.cpu) && s.cpu >= 0 ? s.cpu : Infinity;
const byLoad = (ours: Record<number, number>) => (a: VpnServer, b: VpnServer) =>
  load(a) - load(b) || (ours[a.id] ?? 0) - (ours[b.id] ?? 0);

/** Public picker data: raw readings, lowest first; bars compare this list, not capacity. */
export function serverTrafficList(list: VpnServer[], cc?: string | null) {
  // With the box's country known: home country first, then nearby countries, far-away ones last
  // (a quiet server abroad still streams worse than a busier one close by); traffic sorts within each.
  const want = wanted(cc, list);
  const near = nearbyOf(want[0], list, !list.some(s => code(s.country_code) === want[0]));
  const rank = (s: VpnServer) => {
    if (!cc) return 0;
    const c = code(s.country_code);
    return c === want[0] ? 0 : near.includes(c) ? 1 : want.includes(c) ? 2 : 3;
  };
  const sorted = [...list].sort((a, b) => rank(a) - rank(b) || load(a) - load(b) || a.id - b.id);
  const maximum = Math.max(0, ...sorted.map(s => Number.isFinite(load(s)) ? load(s) : 0));
  return sorted.map(s => ({
    id: s.id, country: s.country_code, city: s.city, ip: s.ip ?? null, group: rank(s),
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
  const want = wanted(cc, list);
  const sort = byLoad(ours);
  for (const c of want) {
    const inC = list.filter((s) => code(s.country_code) === c).sort(sort);
    if (!inC.length) continue;
    const home = inC[0];
    const nearC = nearbyOf(c, list);
    const near = list.filter((s) => nearC.includes(code(s.country_code))).sort(sort)[0];
    return near && Number.isFinite(load(near)) && load(near) <= load(home) * VPN_NEARBY_SHARE ? near : home;
  }
  return list[0] ?? null;
}

/**
 * The box's real country for VPN choices: the last check-in made with BM VPN off. Older apps
 * don't say, so while on our VPN (check-in country = VPN exit) they fall back to the UK.
 */
export function vpnHomeCountry(device: { geo_country?: string | null; vpn_status?: string | null; home_country?: string | null }): string {
  if (device.home_country) return code(device.home_country);
  return device.vpn_status === "yes" || !device.geo_country ? "GB" : code(device.geo_country);
}

/** Pings within this many ms of the fastest count as equally fast; traffic then decides. */
export const VPN_PING_TIE_MS = 15;
/**
 * "Use the best server" with the box's own ping readings: the lowest ping among servers in the
 * country the box is really in and its nearby countries (so an overseas box uses its nearest
 * countries, not the UK). Near-equal pings go to the quieter server. Null when nothing was measured.
 */
export function pickByPing(list: VpnServer[], cc: string | null | undefined, pings: Record<string, number>): VpnServer | null {
  const home = code(cc) || "GB";
  const allowed = new Set([home, ...nearbyOf(home, list, !list.some(s => code(s.country_code) === home))]);
  const ms = (s: VpnServer) => { const v = Number(pings[String(s.id)]); return Number.isFinite(v) && v > 0 ? v : Infinity; };
  const cand = list.filter(s => allowed.has(code(s.country_code)) && Number.isFinite(ms(s)));
  if (!cand.length) return null;
  const fastest = Math.min(...cand.map(ms));
  return cand.filter(s => ms(s) <= fastest + VPN_PING_TIE_MS).sort((a, b) => load(a) - load(b) || ms(a) - ms(b))[0];
}
