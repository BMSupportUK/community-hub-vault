/**
 * Central role ranking.
 *
 * Users may hold several roles at once (duplicates are allowed). BM Support
 * roles always outrank Boro Fan Zone roles, so wherever a single "highest"
 * role is shown, the support role wins.
 */
export const ROLE_PRIORITY = [
  // BM Support (highest)
  "admin",
  "management",
  "moderator",
  "staff",
  "subscriber",
  "nonsubscriber",
  "member",
  // Boro Fan Zone
  "boro_fan_zone_moderator",
  "boro_fan_zone_member",
  // States
  "pending",
  "rejected",
  "banned",
] as const;

export type RankedRole = (typeof ROLE_PRIORITY)[number];

/** BM Support roles, in rank order. */
export const SUPPORT_STAFF_ROLES = ["admin", "management", "moderator", "staff"] as const;

export function roleRank(role: string): number {
  const i = (ROLE_PRIORITY as readonly string[]).indexOf(role);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

export function isSupportRole(role: string): boolean {
  return !role.startsWith("boro_fan_zone_");
}

/** Sort roles so BM Support roles come before Boro Fan Zone roles. */
export function sortRolesByPriority<T extends string>(roles: readonly T[]): T[] {
  return [...roles].sort((a, b) => roleRank(a) - roleRank(b));
}

/** Highest-ranked role held, or null. */
export function highestRole<T extends string>(roles: readonly T[]): T | null {
  return sortRolesByPriority(roles)[0] ?? null;
}
