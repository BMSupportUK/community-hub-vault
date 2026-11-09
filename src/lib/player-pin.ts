/** BM Player 4-digit main-menu PIN: weak-PIN rules and salted PBKDF2 hashing (works on the edge runtime). */

export const PIN_ITERATIONS = 100_000;

/** Refuse easy guesses: all the same digit, straight runs up or down, and a few common picks. */
export function weakPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return true;
  if (/^(\d)\1{3}$/.test(pin)) return true;
  const d = pin.split("").map(Number);
  const up = d.every((v, i) => i === 0 || v === (d[i - 1] + 1) % 10);
  const down = d.every((v, i) => i === 0 || v === (d[i - 1] + 9) % 10);
  if (up || down) return true;
  return ["1212", "1122", "6969", "1004", "2000", "1010"].includes(pin);
}

const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");

export function newSalt(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: PIN_ITERATIONS }, key, 256);
  return hex(bits);
}

export async function pinMatches(pin: string, salt: string, hash: string): Promise<boolean> {
  if (!/^\d{4}$/.test(pin)) return false;
  const got = await hashPin(pin, salt);
  let diff = got.length ^ hash.length;
  for (let i = 0; i < Math.min(got.length, hash.length); i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
