export type InboxPrivacy = "everyone" | "friends" | "staff" | "nobody";

export const INBOX_PRIVACY_OPTIONS: { value: InboxPrivacy; label: string; hint: string }[] = [
  { value: "everyone", label: "Everyone", hint: "Anyone with inbox access" },
  { value: "friends", label: "Friends only", hint: "People on your friends list" },
  { value: "staff", label: "Staff only", hint: "Admin, management, staff and moderators" },
  { value: "nobody", label: "Nobody", hint: "No new messages" },
];

/** Mirrors public.bm_inbox_can_message. Admin/management can always message. */
export function canMessage(setting: InboxPrivacy, senderRoles: string[], isFriend: boolean): boolean {
  if (senderRoles.some((r) => r === "admin" || r === "management")) return true;
  switch (setting) {
    case "everyone": return true;
    case "nobody": return false;
    case "staff": return senderRoles.some((r) => r === "staff" || r === "moderator");
    case "friends": return isFriend;
  }
}
