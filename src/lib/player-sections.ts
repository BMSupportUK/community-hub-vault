import type { PagePermMap } from "@/lib/page-access";

/** Prefix of the Role permissions rows that control BM Player dashboard sections. */
export const PLAYER_SECTION_PREFIX = "bm-player-";

/** Sections the owner can open up to other roles from Role permissions › BM Player. */
export const PLAYER_GRANTABLE_SECTIONS = [
  "security", "installer-codes", "announcements", "major-announcements", "devices",
  "connection-limits", "watch-time", "guide-matching", "channel-status", "buffering", "live",
] as const;

/**
 * True when these roles may open one BM Player dashboard section.
 * The owner (admin) opens everything; anyone else needs their role ticked on
 * that section's row. Owner-only sections (DNS, maintenance, channel matching,
 * customer logins) are never grantable. Boro Fan Zone roles never count.
 */
export function playerSectionAllowed(section: string, roles: readonly string[], perms: PagePermMap | null): boolean {
  if (roles.includes("admin")) return true;
  if (!(PLAYER_GRANTABLE_SECTIONS as readonly string[]).includes(section)) return false;
  const allowed = perms?.[PLAYER_SECTION_PREFIX + section];
  if (!allowed) return false;
  return roles.some((r) => !r.startsWith("boro_fan_zone") && allowed.includes(r));
}

export function anyPlayerSectionAllowed(roles: readonly string[], perms: PagePermMap | null): boolean {
  return roles.includes("admin") || PLAYER_GRANTABLE_SECTIONS.some((s) => playerSectionAllowed(s, roles, perms));
}
