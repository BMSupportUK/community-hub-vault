/** Only a successful password check for the currently locked account can unlock it. */
export function passwordUnlockMatches(expectedUserId: string, verifiedUserId: string | undefined, error: unknown): boolean {
  return Boolean(expectedUserId) && !error && verifiedUserId === expectedUserId;
}