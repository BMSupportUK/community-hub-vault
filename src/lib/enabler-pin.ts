/** BM TV Enabler login PIN rules (shared by website and server). */
export const PIN_TTL_MS = 24 * 3600_000;
export const PIN_MAX_TRIES = 5;
export const PIN_LOCK_MS = 15 * 60_000;

export function makePin(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 1_000_000).padStart(6, "0");
}

export const isPinFormat = (p: string) => /^\d{6}$/.test(p);

/** A PIN works only before expiry and when not replaced. */
export function pinUsable(row: { expires_at: string; revoked_at: string | null }, now = Date.now()) {
  return !row.revoked_at && new Date(row.expires_at).getTime() > now;
}

export async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const pinHash = (pin: string) => sha256Hex(`enabler-pin:${pin}`);
