export type MatchdayMembership = "named" | "absent" | "unknown";

/** Squad locking is not kick-off: presentation follows the match itself. */
export function isFantasyPreGame(
  gameweek?: { kickoffAt: string; status: string; fixtureStatus: string } | null,
  nowMs = Date.now(),
): boolean {
  if (!gameweek || gameweek.status === "final") return false;
  if (["IN_PLAY", "LIVE", "PAUSED", "FINISHED", "FT", "FINAL"].includes(gameweek.fixtureStatus.toUpperCase())) return false;
  const kickoff = Date.parse(gameweek.kickoffAt);
  return Number.isFinite(kickoff) && nowMs < kickoff;
}

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