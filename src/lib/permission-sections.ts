export type PermissionSection = "bm" | "player" | "fanzone";

const FAN_ZONE_KEYS = new Set([
  "forum",
  "admin-fan-zone",
  "admin-forum",
  "admin-boro-team-sheet",
  "admin-predictions",
]);

/** Which Role permissions tab a page belongs to: BM Support, BM Player sections, or Boro Fan Zone. */
export function permissionSection(pageKey: string): PermissionSection {
  if (pageKey.startsWith("bm-player-")) return "player";
  if (FAN_ZONE_KEYS.has(pageKey)) return "fanzone";
  if (pageKey.startsWith("fan-zone") || pageKey.startsWith("admin-fantasy") || pageKey.includes("boro")) return "fanzone";
  return "bm";
}
