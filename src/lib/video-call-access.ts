/** Who may take part in a live two-way video help call. */
export const VIDEO_CALL_STAFF_ROLES = ["admin", "management", "staff"] as const;

export function canTakeVideoCalls(roles: readonly string[]): boolean {
  return roles.some((r) => (VIDEO_CALL_STAFF_ROLES as readonly string[]).includes(r));
}

/** A ticket call can be started by its owner or by staff, only while the ticket is open and the office is open. */
export function canStartTicketVideoCall(opts: {
  roles: readonly string[];
  isOwner: boolean;
  ticketStatus: string;
  businessOpen: boolean;
}): boolean {
  if (!opts.businessOpen) return false;
  if (opts.ticketStatus === "closed") return false;
  return opts.isOwner || canTakeVideoCalls(opts.roles);
}

/** The person who did not start the ringing call answers it: staff answer a customer, the owner answers staff. */
export function canAnswerTicketVideoCall(opts: {
  roles: readonly string[];
  isOwner: boolean;
  startedByOwner: boolean;
}): boolean {
  return opts.startedByOwner ? canTakeVideoCalls(opts.roles) : opts.isOwner;
}

export type StaffCallMember = { userId: string; name: string; role: string; joinedAt: number; host: boolean };

/** Who carries the customer's picture for the other staff: the earliest-joined
 *  flagged host, otherwise the earliest-joined staff member still on the call. */
export function pickCallHost(members: readonly StaffCallMember[]): string | null {
  const byJoin = [...members].sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId));
  return (byJoin.find((m) => m.host) ?? byJoin[0])?.userId ?? null;
}

/** A staff member leaving only ends the whole call when nobody else is on it. */
export function leavingEndsCall(members: readonly StaffCallMember[], me: string): boolean {
  return !members.some((m) => m.userId !== me);
}

export const CALL_ASSIST_COOLDOWN_MS = 2 * 60 * 1000;

/** Seconds until another admin/management help request may be sent (0 = now). */
export function assistWaitSeconds(lastRequestAt: number | null, now: number): number {
  if (lastRequestAt == null) return 0;
  return Math.max(0, Math.ceil((lastRequestAt + CALL_ASSIST_COOLDOWN_MS - now) / 1000));
}

/** Ticket chat command staff type to send the customer a video-call QR code. */
export function isVideoCommand(text: string): boolean {
  return /^\/video\s*$/i.test(text.trim());
}

/** Only admin, management and staff may use the /video command. */
export const canUseVideoCommand = canTakeVideoCalls;

const INVITE_RE = /\[\[video:([a-f0-9]{64})\]\]/;

export function videoInviteMessage(token: string): string {
  return `📹 Video call: scan this code with your phone's camera, or tap the link on your phone, then tap Start video call.\n[[video:${token}]]`;
}

/** The invite token inside a ticket message, if it is a video-call invite. */
export function parseVideoInvite(content: string | null | undefined): { token: string; text: string } | null {
  const m = (content ?? "").match(INVITE_RE);
  if (!m) return null;
  return { token: m[1], text: (content ?? "").replace(INVITE_RE, "").trim() };
}
