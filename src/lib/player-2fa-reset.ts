/** One-off 2FA help chat links for BM Player customers without a website account. */
export function newResetToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(v: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** 8-digit reset code so a TV remote number pad can type it. */
export function newResetCode(): string {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(b[0] % 100_000_000).padStart(8, "0");
}

export const RESET_NUMBER_TRIES = 5;

/** A link stops working once finished, replaced, expired or out of tries. */
export function resetLinkAlive(row: { status: string; expires_at: string } | null, now = Date.now()): boolean {
  return !!row && ["open", "code_issued", "reset"].includes(row.status) && Date.parse(row.expires_at) > now;
}
