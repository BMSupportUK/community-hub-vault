// BM TV Enabler confirmation codes: 6 characters, reusable on their bound ticket/order for 2 hours.
export const CONFIRM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CONFIRM_TTL_MS = 2 * 60 * 60 * 1000;

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
