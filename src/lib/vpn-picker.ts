/** Best-server choice for "VPN on your box": nearest to the customer first, then fewest people connected. */
export type VpnServer = { host: string; cc: string; city?: string | null; load?: number | null };
export type VpnPlace = { cc?: string | null; city?: string | null };

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

/** Same city beats same country beats anywhere; within a group the lowest load wins (unknown load counts as busy). */
export function pickBestServer(servers: VpnServer[], place: VpnPlace): VpnServer | null {
  const cc = norm(place.cc), city = norm(place.city);
  const rank = (s: VpnServer) => (city && norm(s.city) === city && norm(s.cc) === cc ? 0 : cc && norm(s.cc) === cc ? 1 : 2);
  const load = (s: VpnServer) => (typeof s.load === "number" && s.load >= 0 ? s.load : 101);
  return [...servers].sort((a, b) => rank(a) - rank(b) || load(a) - load(b))[0] ?? null;
}

/** Fills a provider host template such as "{cc}.privacy.network" for providers that publish no load figures. */
export function hostFromTemplate(template: string, place: VpnPlace): string {
  const cc = norm(place.cc) || "gb";
  const city = norm(place.city).replace(/[^a-z]/g, "") || (cc === "gb" ? "london" : cc);
  return template.replaceAll("{cc}", cc === "gb" && template.includes("privacy.network") ? "uk" : cc).replaceAll("{city}", city);
}

/** NordVPN country ids for the areas our customers are in. */
export const NORD_COUNTRY: Record<string, number> = { gb: 227, ie: 108, us: 228, es: 202, fr: 74, de: 81, nl: 153, pt: 175, it: 106, ca: 38, au: 13 };
