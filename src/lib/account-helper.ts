/** Forgot Account Login helper chat (scripted). Replies themselves come from the account_helper_reply DB function. */
export const ACCOUNT_HELPER_SLUG = "account";
export const HELPER_PROMPT_PREFIX = "🔑 **Login helper**";

export type HelperChoice = "logged_in" | "cant_find" | "still_stuck";
export const HELPER_CHOICES: { id: HelperChoice; label: string }[] = [
  { id: "logged_in", label: "I found them and I'm logged in" },
  { id: "cant_find", label: "I can't find them" },
  { id: "still_stuck", label: "I found them but still can't log in" },
];

export const accountHelperWelcome = (origin: string) =>
  `${HELPER_PROMPT_PREFIX}\n\nHi! Let's get you back into your account. Your app logins are kept safe on your **Service Credentials** page.\n\n🔗 [Open Service Credentials](${origin}/portal/logins)\n\n1. Open the Service Credentials page (key icon in the side menu).\n2. Unlock it with the code we email you.\n3. Copy your username and password into the app.\n\nOnce you've tried, let me know with a button below — if you're logged in, I'll close this ticket for you.`;

/** Out-of-hours notice never shows on Forgot Account Login tickets. */
export const skipOutOfHours = (slug: string | undefined) => slug === ACCOUNT_HELPER_SLUG;

/** Buttons show only for the ticket's customer, on an open account ticket, while the latest public message is a helper prompt. */
export function showHelperButtons(o: {
  slug: string | undefined; status: string; isOwner: boolean;
  messages: { content: string; is_internal: boolean }[];
}) {
  if (o.slug !== ACCOUNT_HELPER_SLUG || o.status === "closed" || !o.isOwner) return false;
  const last = [...o.messages].reverse().find((m) => !m.is_internal);
  return !!last && last.content.startsWith(HELPER_PROMPT_PREFIX);
}
