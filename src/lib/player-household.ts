/**
 * Multi Room / Triple Room household rule.
 * - Home = the internet connection of the first box linked.
 * - One mobile connection per account, ever (the first phone on mobile data keeps the slot).
 * - Only ONE device may watch away from home at a time (the phone, or a box taken on holiday).
 * - While an away box is watching, nothing at home can play (and the other way round), so the
 *   account is never used in two places at once. "Watch here instead" stops the other side.
 * - VPNs are allowed while watching: a box on a VPN keeps the home/away status it last had.
 * - A box trying to watch away while home is watching is a strike; 3 strikes in 7 days blocks
 *   that login from playing away from home (phone excepted) until an admin clears it.
 * - If every other box has moved to the same new connection, home moves with them (new broadband).
 */
export type HouseholdOther = { id: string; away: boolean; mobile: boolean; ip?: string | null };
export type HouseholdCheck = {
  connections: number;
  deviceId: string;
  homeIp: string | null;
  ip: string | null;
  mobile: boolean;
  vpn: boolean;
  /** This device's away status from its last non-VPN check. */
  lastAway: boolean;
  mobileDeviceId: string | null;
  blockedAway: boolean;
  /** Other devices on this login watching right now. */
  watching: HouseholdOther[];
  /** Latest connection of every other (non-mobile) box on this login. */
  otherBoxIps: string[];
};
export type HouseholdVerdict = {
  kind: "ok" | "second_mobile" | "blocked" | "away_slot" | "two_places" | "home_waits";
  away: boolean;
  setHome: boolean;
  newHome: string | null;
  takeMobileSlot: boolean;
  /** Not allowed at all (no "Watch here instead"). */
  refuse: boolean;
  /** Devices that must stop if the customer chooses "Watch here instead". */
  stopIds: string[];
  strike: boolean;
  message: string | null;
};

export const MSG_SECOND_MOBILE = "Only one mobile connection is allowed per account. This phone can't watch on this login.";
export const MSG_BLOCKED = "This login can only be used at home. Contact BM Support.";
export const MSG_AWAY_SLOT = "Another device on your login is already watching away from home. Only one device can watch away from home at a time.";
export const MSG_TWO_PLACES = "Your login is being watched at home right now. It can't be used in two places at once.";
export const MSG_HOME_WAITS = "Your login is being watched away from home. Nothing at home can play while it is.";
export const STRIKES_TO_BLOCK = 3;
export const STRIKE_WINDOW_MS = 7 * 86_400_000;

/** IPv6 devices share a /64, not a host address. IPv4 still identifies one public address. */
function householdNetwork(ip: string): string | null {
  if (!ip.includes(":")) return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split(".").every((n) => Number(n) <= 255) ? `v4:${ip}` : null;
  try {
    // The standard URL parser validates and canonicalizes compressed, expanded and mapped IPv6.
    const host = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    const [left = "", right = ""] = host.split("::");
    const start = left ? left.split(":") : [];
    const end = right ? right.split(":") : [];
    const words = host.includes("::") ? [...start, ...Array(8 - start.length - end.length).fill("0"), ...end] : start;
    const values = words.map((word) => parseInt(word, 16));
    if (values.length !== 8 || values.some((word) => !Number.isFinite(word))) return null;
    // IPv4-mapped addresses must not turn every IPv4 customer into one /64 household.
    if (values.slice(0, 5).every((word) => word === 0) && values[5] === 0xffff) {
      const high = values[6], low = values[7];
      if (high === undefined || low === undefined) return null;
      return `v4:${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
    return `v6:${values.slice(0, 4).join(":")}`;
  } catch { return null; }
}

function sameHouseholdNetwork(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const network = householdNetwork(a);
  return network !== null && network === householdNetwork(b);
}

export function householdVerdict(c: HouseholdCheck): HouseholdVerdict {
  const v: HouseholdVerdict = { kind: "ok", away: false, setHome: false, newHome: null, takeMobileSlot: false, refuse: false, stopIds: [], strike: false, message: null };
  if (c.connections < 2) return v;
  if (c.mobile && !c.vpn) {
    if (c.mobileDeviceId && c.mobileDeviceId !== c.deviceId) return { ...v, kind: "second_mobile", refuse: true, message: MSG_SECOND_MOBILE };
    if (!c.mobileDeviceId) v.takeMobileSlot = true;
  }
  if (c.vpn || !c.ip) v.away = c.lastAway;
  else if (!c.homeIp) { v.away = c.mobile; v.setHome = !c.mobile; }
  else v.away = !sameHouseholdNetwork(c.ip, c.homeIp);
  if (v.away && !c.vpn && !c.mobile && c.ip && c.otherBoxIps.length > 0 && c.otherBoxIps.every((x) => sameHouseholdNetwork(x, c.ip))) { v.away = false; v.newHome = c.ip; }
  // Re-evaluate saved non-mobile peer addresses so old false-away flags cannot block home TVs.
  // VPN peers keep their last non-VPN claim_ip; mobile peers retain the separate away-slot rule.
  const homeIp = v.newHome ?? c.homeIp;
  const isAway = (d: HouseholdOther) => !d.mobile && d.ip && homeIp ? !sameHouseholdNetwork(d.ip, homeIp) : d.away;
  const awayOthers = c.watching.filter(isAway), homeOthers = c.watching.filter((d) => !isAway(d));
  if (v.away) {
    if (c.blockedAway && !c.mobile) return { ...v, kind: "blocked", refuse: true, message: MSG_BLOCKED };
    if (awayOthers.length) return { ...v, kind: "away_slot", stopIds: awayOthers.map((d) => d.id), message: MSG_AWAY_SLOT };
    if (!c.mobile && homeOthers.length) return { ...v, kind: "two_places", stopIds: homeOthers.map((d) => d.id), strike: true, message: MSG_TWO_PLACES };
    return v;
  }
  const awayBoxes = awayOthers.filter((d) => !d.mobile);
  if (awayBoxes.length) return { ...v, kind: "home_waits", stopIds: awayBoxes.map((d) => d.id), message: MSG_HOME_WAITS };
  return v;
}

export function shouldBlock(strikesInWindow: number): boolean { return strikesInWindow >= STRIKES_TO_BLOCK; }
