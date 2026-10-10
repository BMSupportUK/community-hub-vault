export type MatchdayMembership = "named" | "absent" | "unknown";

/** Absence is established only by a complete, confirmed XI and substitute list. */
export function matchdayMembership(
  playerId: string,
  squadIds: ReadonlySet<string> | null,
  minutes?: number | null,
): MatchdayMembership {
  if ((minutes ?? 0) > 0) return "named";
  if (!squadIds) return "unknown";
  return squadIds.has(playerId) ? "named" : "absent";
}