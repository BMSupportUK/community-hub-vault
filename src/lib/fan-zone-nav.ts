export const FAN_ZONE_PREFIXES = [
  "/forum",
  "/fanzone",
  "/fan-zone",
  "/admin-fan-zone",
  "/admin-reports",
  "/boro-fantasy",
  "/boro-predictions",
  "/predictions",
  "/competition-winners",
] as const;

export function isFanZonePath(path: string): boolean {
  return FAN_ZONE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Roles that grant access to the BM Support side of the app. */
const SUPPORT_ROLES = [
  "admin",
  "management",
  "staff",
  "moderator",
  "subscriber",
  "nonsubscriber",
  "member",
];

/** Fan Zone roles a Fan-Zone-only signup can hold. */
const FAN_ZONE_ROLES = ["boro_fan_zone_member", "boro_fan_zone_moderator"];

/**
 * True when the account only exists for the Boro Fan Zone (signed up via the
 * Fan Zone intent) and has no BM Support access at all.
 */
export function isFanZoneOnlyRoles(roles: readonly string[]): boolean {
  if (!roles.length) return false;
  const hasFanZone = roles.some((r) => FAN_ZONE_ROLES.includes(r));
  if (!hasFanZone) return false;
  return !roles.some((r) => SUPPORT_ROLES.includes(r));
}

/**
 * Non-Fan-Zone paths a Fan-Zone-only account is still allowed to reach
 * (account/security screens and auth state pages).
 */
const FAN_ZONE_ONLY_ALLOWED = [
  "/account-security",
  "/account-rejected",
  "/banned",
  "/gate",
  "/fan-zone-pending",
  "/login",
  "/signup",
];

export function isAllowedForFanZoneOnly(path: string): boolean {
  if (isFanZonePath(path)) return true;
  return FAN_ZONE_ONLY_ALLOWED.some((p) => path === p || path.startsWith(`${p}/`));
}
