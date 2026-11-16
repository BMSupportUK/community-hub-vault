/** Unknown or failed assurance checks never grant access. */
export function mfaAccessState(current: unknown, next: unknown, error: unknown): "allowed" | "challenge" | "error" {
  if (error) return "error";
  if (next === "aal2" && current !== "aal2") return "challenge";
  if ((current !== "aal1" && current !== "aal2") || (next !== "aal1" && next !== "aal2")) return "error";
  return next === "aal2" && current !== "aal2" ? "challenge" : "allowed";
}

export function mfaRecoveryActionAllowed(name: string): boolean {
  return name === "requestMfaReset" || name === "listMyMfaFactors";
}