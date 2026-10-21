/**
 * Who may see another person's email address in the app.
 *
 * Email is account-setup information: the owner and management need it to
 * create or fix a login, so it stays with them. Customers, staff, moderators
 * and Fan Zone roles never see an email in a card, list or order view. The one
 * deliberate exception is the Blacklist section, which has its own rule.
 */
export const EMAIL_VISIBLE_ROLES = ["admin", "management"] as const;

export function canSeeUserEmail(roles: readonly string[]): boolean {
  return EMAIL_VISIBLE_ROLES.some((role) => roles.includes(role));
}
