export const TICKET_SCREEN_SHARE_MARKER = "[[screen-share]]";
export function ticketScreenShareInvite() {
  return `Please share your TV screen so we can help with this ticket. Open BM Remote Helper on your TV and enter its six-digit code in this message. ${TICKET_SCREEN_SHARE_MARKER}`;
}
export function isTicketScreenShareInvite(content: string) {
  return content.includes(TICKET_SCREEN_SHARE_MARKER);
}
export function ticketShareConnected(previous: string | null, current: string | null) {
  return previous === "pending" && (current === "claimed" || current === "active");
}