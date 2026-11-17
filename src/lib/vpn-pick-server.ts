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
