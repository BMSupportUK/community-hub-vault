import { freshSecondFactor } from "./application-access-policy";

/** Only a successful password check for the currently locked account can unlock it. */
export function passwordUnlockMatches(expectedUserId: string, verifiedUserId: string | undefined, error: unknown): boolean {
  return Boolean(expectedUserId) && !error && verifiedUserId === expectedUserId;
}

/** Management keeps password-only unlock; Admin, Staff and Moderators always use 2FA. */
export function screenUnlockRequiresMfa(roles: readonly string[]): boolean {
  if (roles.includes("management")) return false;
  return roles.some((role) => role === "admin" || role === "staff" || role === "moderator");
}

/** The password step never unlocks these roles without a newly submitted TOTP. */
export function screenUnlockAwaitingMfa(
  roles: readonly string[],
  secondFactorSubmitted: boolean,
  claims: Record<string, unknown>,
  now = Date.now(),
): boolean {
  return screenUnlockRequiresMfa(roles) && (!secondFactorSubmitted || !freshSecondFactor(claims, now));
}
