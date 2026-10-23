export const TICKET_SCREEN_SHARE_MARKER = "[[screen-share]]";
export function ticketScreenShareInvite() {
  return `Please share your TV screen so we can help with this ticket. Open BM Remote Helper on your TV, then open the Screen share tab here and enter the six-digit code. ${TICKET_SCREEN_SHARE_MARKER}`;
}
export function isTicketScreenShareInvite(content: string) {
  return content.includes(TICKET_SCREEN_SHARE_MARKER);
}