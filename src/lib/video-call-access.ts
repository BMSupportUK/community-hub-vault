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
