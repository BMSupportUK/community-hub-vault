import { packageSortKey } from "./package-order";

/** VPN add-on price: £2 for every month of the package bought (in pence). */
export const VPN_ADDON_MONTHLY_PENCE = 200;
/** Order lines for the VPN always start with this name, so completion can spot them. */
export const VPN_ADDON_PREFIX = "VPN add-on";

/** Total months of package in the basket (quantity counts). Items we can't read a length from add nothing. */
export function vpnAddonMonths(items: { name: string; qty: number }[]): number {
  return items.reduce((sum, it) => {
    if (it.name.startsWith(VPN_ADDON_PREFIX)) return sum;
    const m = packageSortKey(it.name).months;
    return sum + (m > 0 ? m * Math.max(0, Math.floor(it.qty)) : 0);
  }, 0);
}

export function vpnAddonPence(months: number): number {
  return Math.max(0, Math.floor(months)) * VPN_ADDON_MONTHLY_PENCE;
}

export function vpnAddonLineName(months: number): string {
  return `${VPN_ADDON_PREFIX} (${months} month${months === 1 ? "" : "s"})`;
}

/** Average month length used for the pro-rata price (365.25 / 12). */
export const VPN_DAYS_PER_MONTH = 30.4375;
/** Smallest app purchase the card/bank providers will take. */
export const VPN_MIN_PENCE = 50;
const DAY_MS = 864e5;

/**
 * VPN bought in BM Player: £2 a month, pro rata to the time left on the subscription, charged by the day.
 * Ends on the subscription's own end date. Null when nothing is left to buy.
 */
export function vpnProRata(expiryIso: string | null | undefined, nowMs: number): { days: number; pence: number; until: string } | null {
  if (!expiryIso) return null;
  const end = new Date(expiryIso).getTime();
  if (!Number.isFinite(end) || end <= nowMs) return null;
  const days = Math.ceil((end - nowMs) / DAY_MS);
  return { days, pence: Math.round((VPN_ADDON_MONTHLY_PENCE * days) / VPN_DAYS_PER_MONTH), until: new Date(end).toISOString() };
}

export function vpnAppLineName(days: number): string {
  return `${VPN_ADDON_PREFIX} (${days} day${days === 1 ? "" : "s"})`;
}

/** VPNresellers wholesale: $1.99 per active account per month (1–999 accounts) ≈ £1.57. Owners can change it in Profit › VPN. */
export const VPN_DEFAULT_COST_PENCE_MONTH = 157;
/** What one VPN sale cost us for the days it covers. */
export function vpnCostPence(days: number, costPerMonth: number): number {
  return Math.round((Math.max(0, days) * Math.max(0, costPerMonth)) / VPN_DAYS_PER_MONTH);
}
/** Days covered by a VPN order line: "(N days)" for app purchases, "(N months)" for older shop lines. */
export function vpnLineDays(name: string, qty: number): number {
  const d = /\((\d+) days?\)/.exec(name); if (d) return Number(d[1]);
  const m = /\((\d+) months?\)/.exec(name); if (m) return Math.round(Number(m[1]) * VPN_DAYS_PER_MONTH);
  return Math.round(Math.max(1, qty) * VPN_DAYS_PER_MONTH);
}

/** One VPN = 1 device at a time; Single 1, Multi Room 2, Triple Room 3 VPNs. */
export function vpnRoomVerdict(o: { here: boolean; held: number; slots: number; rooms: number }): "here" | "spare" | "buy" | "full" {
  if (o.here) return "here";
  if (o.held < o.slots) return "spare";
  return o.slots < Math.min(Math.max(o.rooms, 1), 3) ? "buy" : "full";
}
