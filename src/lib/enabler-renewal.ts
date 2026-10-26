export function renewalMessage(state: string): string {
  switch (state) {
    case "queued": return "Keep BM TV Enabler open on the same Wi-Fi as your TV. It will bring the new connection here automatically.";
    case "update_app": return "Update BM TV Enabler, then enter its confirmation reference once to enable automatic reconnection.";
    case "in_progress": return "Your current screen-share request is still open. End it before requesting another connection.";
    case "expired": return "Your Enabler reference has expired. Get a new confirmation reference in BM TV Enabler.";
    default: return "Could not request a new connection. Please try again.";
  }
}