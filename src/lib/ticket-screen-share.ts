export const TICKET_SCREEN_SHARE_MARKER = "[[screen-share]]";
// Presentation-only exception for the owner's explicitly requested test ticket.
// Pairing permissions still come from the owner-only database RPC.
export function isCustomerTestTicket(ticketId: string, userId: string | undefined) {
  return ticketId === "dd7ef1da-e99d-4225-bf9a-baf84053f4dd" && userId === "73c113ce-ce1b-43f0-af24-c2a36cf0d8e7";
}
export function ticketScreenShareInvite() {
  return `Please share your TV screen so we can help with this ticket. Open BM Remote Helper on your TV and enter its six-digit code in this message. ${TICKET_SCREEN_SHARE_MARKER}`;
}
export function isTicketScreenShareInvite(content: string) {
  return content.includes(TICKET_SCREEN_SHARE_MARKER);
}
export function ticketShareConnected(previous: string | null, current: string | null) {
  return previous === "pending" && (current === "claimed" || current === "active");
}// Staff jump to the Screen share tab the moment the customer's TV code creates a request.
export function ticketShareRequested(previous: string | null | undefined, current: string | null) {
  return previous !== undefined && previous !== "pending" && current === "pending";
}
