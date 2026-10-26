// Matches the existing queued-request lifetime; a stalled request can be retried.
export const RENEWAL_WAIT_MS = 3 * 60_000;
export class RenewalRequestGate {
  expiresAt = 0;
  previousSession: string | null = null;
  waiting(now = Date.now()) { return this.expiresAt > now; }
  begin(session: string | null, now = Date.now()) {
    if (this.waiting(now)) return false;
    this.previousSession = session;
    this.expiresAt = now + RENEWAL_WAIT_MS;
    return true;
  }
  finish(state: string) {
    if (state !== "queued" && state !== "in_progress") this.reset();
  }
  sync(session: string | null, now = Date.now()) {
    if (!this.waiting(now) || (session && session !== this.previousSession)) this.reset();
  }
  reset() { this.expiresAt = 0; this.previousSession = null; }
}

export function renewalMessage(state: string): string {
  switch (state) {
    case "queued": return "Keep BM TV Enabler open on the same Wi-Fi as your TV. It will bring the new connection here automatically.";
    case "update_app": return "Update BM TV Enabler, then enter its confirmation reference once to enable automatic reconnection.";
    case "in_progress": return "Your current screen-share request is still open. End it before requesting another connection.";
    case "expired": return "Your Enabler reference has expired. Get a new confirmation reference in BM TV Enabler.";
    default: return "Could not request a new connection. Please try again.";
  }
}