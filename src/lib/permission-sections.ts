export type PermissionSection = "bm" | "fanzone";

const FAN_ZONE_KEYS = new Set([
  "forum",
  "admin-fan-zone",
  "admin-forum",
  "admin-boro-team-sheet",
  "admin-predictions",
]);

/** Which Role permissions tab a page belongs to: Boro Fan Zone or BM Support. */
export function permissionSection(pageKey: string): PermissionSection {
  if (FAN_ZONE_KEYS.has(pageKey)) return "fanzone";
  if (pageKey.startsWith("fan-zone") || pageKey.startsWith("admin-fantasy") || pageKey.includes("boro")) return "fanzone";
  return "bm";
}
