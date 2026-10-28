// BM TV Enabler confirmation codes: 6 characters, reusable on their bound ticket/order for 24 hours.
export const CONFIRM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;
/** Install references never run out; the customer replaces one once it is used or logged. */
export const INSTALL_NO_EXPIRY_ISO = "2099-12-31T23:59:59.000Z";

/** Usage is read only after validating the per-reference capability. Never expose scope IDs. */
// Sharing references stay reusable until expiry. Install references have no expiry, so New code
// unlocks once one is typed on a ticket/order or logged as a self install.
export function enablerReferenceUsed(row: { kind?: string | null; used_at: string | null; bound_ticket_id: string | null; bound_order_id: string | null }): boolean {
  return row.kind === "install" && !!row.used_at;
}

export function confirmationActive(expiresAt: string | null, now = Date.now()): boolean {
  return expiresAt !== null && Date.parse(expiresAt) > now;
}

export function normalizeConfirmCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function formatConfirmCode(c: string): string {
  return c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
}

export function makeConfirmCode(random: Uint32Array = crypto.getRandomValues(new Uint32Array(6))): string {
  return [...random].map((n) => CONFIRM_ALPHABET[n % CONFIRM_ALPHABET.length]).join("");
}

type CodeRow = { device: string; expires_at: string; used_at: string | null };
/** Why a stored code can or cannot be used now on a setup for `device`. */
export function confirmCodeState(row: CodeRow | null, device: string, now = new Date()): "ok" | "invalid" | "device_mismatch" {
  if (!row || new Date(row.expires_at) <= now) return "invalid";
  return row.device === device ? "ok" : "device_mismatch";
}
