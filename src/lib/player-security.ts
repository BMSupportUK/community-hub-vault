// BM Player security rules shared by the device API and website actions.

/** Most boxes one app login may run on before an admin must approve another. */
export const MAX_BOXES_PER_LOGIN = 3;
/** A box unused this long is unlinked and must be linked again. */
export const QUIET_BOX_DAYS = 60;
/** Logins are only sent to boxes that checked in this recently. */
export const SEND_LOGIN_SEEN_MS = 3 * 60_000;
/** Same login seen from two countries inside this window raises a sharing alert. */
export const UNUSUAL_PLACE_WINDOW_MS = 30 * 60_000;
export const WRONG_TRIES_PER_STEP = 5;

/** Lockout length for each step: 5 wrong = 15 min, next 5 = 1 hour, next 5 (and after) = 24 hours. */
export function lockoutMinutes(level: number): number {
  if (level <= 1) return 15;
  if (level === 2) return 60;
  return 24 * 60;
}

export function boxLimitReached(otherBoxesOnLogin: number): boolean {
  return otherBoxesOnLogin >= MAX_BOXES_PER_LOGIN;
}

export function isQuietBox(lastSeenAt: string | null | undefined, linkedAt: string | null | undefined, now = Date.now()): boolean {
  const ref = lastSeenAt ?? linkedAt;
  if (!ref) return false;
  return now - Date.parse(ref) > QUIET_BOX_DAYS * 86_400_000;
}

export function recentlySeen(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  return !!lastSeenAt && now - Date.parse(lastSeenAt) <= SEND_LOGIN_SEEN_MS;
}

/** SHA-256 of BM Support's permanent Android signing certificate. */
export const BM_ANDROID_SIGNER = "55282dc68b2108392a5ec0e8fe5660da74b82d7f371c029a79f6037d0be39f62";
/** Android apps too old to prove they're genuine still get logins until this date. */
export const UNSIGNED_GRACE_END = Date.parse("2026-11-23T00:00:00Z");
const ANDROID_PLATFORMS = new Set(["android", "firetv", "phone"]);

/** "ok" = send logins; "fake" = altered copy; "update" = old app past the grace period. */
export function appGenuine(platform: string | null | undefined, sig: string | null | undefined, now = Date.now()): "ok" | "fake" | "update" {
  if (!platform || !ANDROID_PLATFORMS.has(platform)) return "ok";
  if (sig) return sig.toLowerCase() === BM_ANDROID_SIGNER ? "ok" : "fake";
  return now < UNSIGNED_GRACE_END ? "ok" : "update";
}

/** Another box on the same login, in a different country, seen within the window. */
export function unusualPlace(
  here: string | null | undefined,
  others: { geo_country: string | null; last_seen_at: string | null }[],
  now = Date.now(),
): string | null {
  if (!here) return null;
  for (const o of others) {
    if (o.geo_country && o.geo_country !== here && o.last_seen_at && now - Date.parse(o.last_seen_at) <= UNUSUAL_PLACE_WINDOW_MS) return o.geo_country;
  }
  return null;
}
