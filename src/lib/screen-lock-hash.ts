/** Hashing scheme shared between client and server for screen-lock codes. */
export async function hashLockCode(userId: string, code: string): Promise<string> {
  const enc = new TextEncoder().encode(`${userId}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const STAFF_LOCK_ROLES = ["admin", "management", "staff", "moderator"] as const;
export const STAFF_TIMEOUT_OPTIONS = [1, 5, 10];
export const USER_TIMEOUT_OPTIONS = [5, 10, 15, 30, 60];
export const DEFAULT_TIMEOUT_MINUTES = 15;
export const STAFF_MAX_TIMEOUT_MINUTES = 10;

/**
 * Wipe every persisted screen-lock flag/idle timestamp.
 *
 * A fresh sign-in must never inherit a lock left behind by an earlier session
 * (locked, app closed, signed in again) — otherwise the lock screen appears
 * immediately after the user signs in.
 */
export function clearScreenLockState() {
  if (typeof window === "undefined") return;
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("screenlock:"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
}
