export const FAN_ZONE_PREFIXES = [
  "/forum",
  "/fanzone",
  "/fan-zone",
  "/boro-fantasy",
  "/boro-predictions",
  "/predictions",
  "/competition-winners",
] as const;

export function isFanZonePath(path: string): boolean {
  return FAN_ZONE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
