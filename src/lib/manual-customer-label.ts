/** user_id -> email, for customers an owner added by hand. */
export type ManualCustomerEmails = Record<string, string>;

type LabelledUser = {
  id: string;
  username?: string | null;
  display_name?: string | null;
};

/**
 * The email to show next to a username, or null when the customer was not
 * added by hand (site customers never get their email printed here).
 */
export function manualCustomerEmail(
  user: LabelledUser | null | undefined,
  manualEmails: ManualCustomerEmails,
): string | null {
  if (!user?.id) return null;
  const email = manualEmails[user.id];
  return email && email.trim() ? email.trim() : null;
}

/**
 * "jane · jane@example.com" for a manually added customer, plain username for
 * everyone else.
 */
export function customerLabelWithManualEmail(
  user: LabelledUser | null | undefined,
  manualEmails: ManualCustomerEmails,
): string {
  const name = user?.username || user?.display_name || "Unknown";
  const email = manualCustomerEmail(user, manualEmails);
  return email ? `${name} · ${email}` : name;
}
