/**
 * Pure helpers for the APK transfer download links (bmsupport.uk/4839201).
 * Kept free of server imports so the expiry rules can be unit-tested.
 */

/** How long a transfer link stays live: exactly 24 hours. */
export const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000;

// New codes are 7 digits; older 6-16 char alphanumeric tokens keep working
// until they expire (24h max). Mirrors the route-level check.
const SAFE_TOKEN = /^(?:\d{7}|[A-Za-z0-9]{6,16})$/;

export function isSafeToken(token: string): boolean {
  return SAFE_TOKEN.test(token);
}

/**
 * A transfer is only live while its expiry is still in the future.
 * Expired or unknown codes must never serve the APK.
 */
export function isTransferLive(expiresAt: string, nowIso: string): boolean {
  const expires = Date.parse(expiresAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(expires) || Number.isNaN(now)) return false;
  return expires > now;
}
