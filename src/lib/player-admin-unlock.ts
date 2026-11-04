/** BM Player Admin Dashboard stays unlocked for 15 minutes after a correct Staff PIN. */
export const PLAYER_ADMIN_UNLOCK_MS = 15 * 60_000;
const KEY = "bm-player-admin-unlocked-until";

export function unlockedUntil(): number {
  if (typeof window === "undefined") return 0;
  const v = Number(window.sessionStorage.getItem(KEY) ?? 0);
  return Number.isFinite(v) ? v : 0;
}
export function markUnlocked(now = Date.now()): number {
  const until = now + PLAYER_ADMIN_UNLOCK_MS;
  window.sessionStorage.setItem(KEY, String(until));
  return until;
}
export function clearUnlock() { window.sessionStorage.removeItem(KEY); }
export function isStillUnlocked(until: number, now = Date.now()): boolean { return until > now; }
