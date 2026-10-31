/** BM Direct Install secure download links: short, easy-to-type codes for Downloader on the TV. */
export const DIRECT_LINK_TTL_MS = 30 * 60 * 1000;
/** BM Direct Install has its own PIN, valid for 30 minutes (BM TV Enabler PINs last 24 hours). */
export const DIRECT_PIN_TTL_MS = 30 * 60 * 1000;
/** TV progress and website reads use the same active-run window. */
export const DIRECT_PROGRESS_TTL_MS = 6 * 60 * 60 * 1000;
/** Which PIN kind an app may sign in with: BM Direct Install uses only its own PINs. */
export const pinKindForApp = (app?: string | null) => (app ?? "").startsWith("direct") ? "direct" : "enabler";
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

/**
 * Which wizard step BM Direct Install should show next: one past the last step the TV itself
 * reported, so the website moves on by itself as soon as the TV confirms (e.g. unknown apps allowed).
 * On the "already installed" path steps 2–3 never happen, so the TV's reports alone drive the jump.
 */
export function nextDirectStep(reported: boolean[], answeredYes: boolean, step: number): number {
  // A generated link and skipped Downloader steps are not reports from the TV.
  const tvOnly = [false, false, !answeredYes && !!reported[2], !!reported[3], !!reported[4], !!reported[5]];
  const next = tvOnly.lastIndexOf(true) + 1;
  return next > step ? Math.min(next, 5) : step;
}
