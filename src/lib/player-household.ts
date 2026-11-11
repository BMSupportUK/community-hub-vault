/**
 * Multi Room / Triple Room household rule: every box watches from the same home
 * internet connection (set by the first box linked), plus one phone on mobile data.
 * A VPN hides the real location, so it is only reported to admins.
 */
export type HouseholdCheck = {
  connections: number; // package: 1 single, 2 multi, 3 triple
  homeIp: string | null;
  ip: string | null;
  mobile: boolean;
  vpn: boolean;
  /** Other boxes on this login watching right now that are on mobile data away from home. */
  otherMobileWatching: number;
};
export type HouseholdVerdict = { kind: "ok" | "vpn" | "other_house" | "second_mobile"; warn: string | null; setHome: boolean };

export const HOUSE_WARNING = "Multi Room and Triple Room logins can only be used in one home, plus one phone on mobile data. This has been reported to BM Support.";
export const MOBILE_WARNING = "Only one phone on mobile data can watch on this login. This has been reported to BM Support.";

export function householdVerdict(c: HouseholdCheck): HouseholdVerdict {
  if (c.connections < 2 || !c.ip) return { kind: "ok", warn: null, setHome: false };
  if (c.vpn) return { kind: "vpn", warn: null, setHome: false };
  if (!c.homeIp) return { kind: "ok", warn: null, setHome: !c.mobile };
  if (c.ip === c.homeIp) return { kind: "ok", warn: null, setHome: false };
  if (c.mobile) return c.otherMobileWatching >= 1 ? { kind: "second_mobile", warn: MOBILE_WARNING, setHome: false } : { kind: "ok", warn: null, setHome: false };
  return { kind: "other_house", warn: HOUSE_WARNING, setHome: false };
}
