/** BM Player authenticator-app (TOTP, RFC 6238) codes: 6 digits, 30-second steps, SHA-1 — works on the edge runtime. */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newTotpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function decode(secret: string): Uint8Array {
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) {
    const v = B32.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const out = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}

export async function totpAt(secret: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8);
  new DataView(msg).setBigUint64(0, BigInt(step));
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** Accepts the current code or one step either side, to allow for clock drift. */
export async function totpMatches(secret: string, code: string, now = Date.now()): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const step = Math.floor(now / 30_000);
  for (const s of [step - 1, step, step + 1]) if ((await totpAt(secret, s)) === code) return true;
  return false;
}

export const totpUrl = (secret: string, label: string) =>
  `otpauth://totp/${encodeURIComponent(`BM Player:${label}`)}?secret=${secret}&issuer=${encodeURIComponent("BM Player")}&digits=6&period=30`;

/** Authenticator unlock is asked once per day per box. */
export const TOTP_REMEMBER_MS = 24 * 60 * 60_000;
export const totpStillValid = (passedAt: string | null | undefined, now = Date.now()) =>
  !!passedAt && now - Date.parse(passedAt) < TOTP_REMEMBER_MS;
