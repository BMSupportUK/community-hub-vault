/** BM Direct Install secure download links: short, easy-to-type codes for Downloader on the TV. */
export const DIRECT_LINK_TTL_MS = 30 * 60 * 1000;
// No 0/o/1/l/i so codes are easy to read and type with a TV remote.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const DIRECT_CODE_LENGTH = 6;

export function makeDirectCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(DIRECT_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < DIRECT_CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Lower-cases and validates a typed code; null when it can't be one of ours. */
export function normalizeDirectCode(raw: string | null | undefined): string | null {
  const c = (raw ?? "").trim().toLowerCase();
  return c.length === DIRECT_CODE_LENGTH && [...c].every((ch) => ALPHABET.includes(ch)) ? c : null;
}

/** Completed installs retire their original download link, even before its expiry. */
export function directLinkUsable(row: { expires_at: string; completed_at?: string | null } | null, now: number): boolean {
  return !!row && !row.completed_at && Date.parse(row.expires_at) > now;
}

export function directInstallUrl(code: string, origin = "https://bmsupport.uk"): string {
  return `${origin}/di/${code}`;
}
