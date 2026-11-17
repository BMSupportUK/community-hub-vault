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
