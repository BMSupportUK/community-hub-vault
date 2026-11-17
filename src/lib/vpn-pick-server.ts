export type VpnServer = { id: number; name: string; country_code: string; city: string; status: number; visible: number; cpu?: number };

/** A home-country server this busy (provider load figure, 0–100) lets a nearby country take over. */
export const VPN_BUSY_LOAD = 70;
/** A nearby server must be at least this much quieter to be worth the extra distance. */
export const VPN_NEARBY_MARGIN = 20;
const NEARBY = ["GB", "UK", "IE", "NL", "BE", "FR", "DE"];

const byLoad = (ours: Record<number, number>) => (a: VpnServer, b: VpnServer) =>
  (a.cpu ?? 0) - (b.cpu ?? 0) || (ours[a.id] ?? 0) - (ours[b.id] ?? 0);

/**
 * The box's own country first (then UK); within it the server with the least traffic,
 * then the fewest of our customers. When that best home server is busy, a nearby
 * country's server is used instead if it is clearly quieter.
 */
export function pickServer(list: VpnServer[], cc?: string | null, ours: Record<number, number> = {}): VpnServer | null {
  const want = [(cc ?? "").toUpperCase(), ...NEARBY].filter(Boolean);
  const sort = byLoad(ours);
  for (const c of want) {
    const inC = list.filter((s) => s.country_code?.toUpperCase() === c).sort(sort);
    if (!inC.length) continue;
    const home = inC[0];
    if ((home.cpu ?? 0) < VPN_BUSY_LOAD) return home;
    const near = list.filter((s) => want.includes(s.country_code?.toUpperCase()) && s.country_code?.toUpperCase() !== c).sort(sort)[0];
    return near && (near.cpu ?? 0) <= (home.cpu ?? 0) - VPN_NEARBY_MARGIN ? near : home;
  }
  return list[0] ?? null;
}
