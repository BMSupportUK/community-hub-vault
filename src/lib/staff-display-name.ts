/**
 * Staff screens are titled with the person's username, never their email
 * address: emails are only ever shown to admin and management, and a heading
 * like "someone@example.com's shift history" is unreadable anyway.
 */
export function staffDisplayName(
  profile: { username?: string | null; display_name?: string | null } | null | undefined,
  fallback = "Staff",
): string {
  const username = profile?.username?.trim();
  if (username) return username;
  const display = profile?.display_name?.trim();
  if (display && !display.includes("@")) return display;
  return fallback;
}
