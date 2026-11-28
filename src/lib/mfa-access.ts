/** Unknown or failed assurance checks never grant access. */
export function mfaAccessState(
  current: unknown,
  next: unknown,
  error: unknown,
  launchComplete = true,
): "allowed" | "challenge" | "error" {
  if (error) return "error";
  if (next === "aal2" && (current !== "aal2" || !launchComplete)) return "challenge";
  if ((current !== "aal1" && current !== "aal2") || (next !== "aal1" && next !== "aal2")) return "error";
  return "allowed";
}

export function mfaRecoveryActionAllowed(name: string): boolean {
  return name === "requestMfaReset" || name === "listMyMfaFactors";
}