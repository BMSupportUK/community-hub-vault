/** A box counts as on when BM Player checked in within this window (apps only check in while a screen is open). */
export const BOX_ON_WINDOW_MS = 3 * 60_000;
/** A request the box hasn't collected in this time is dropped, so it never jumps to a title much later. */
export const WATCH_REQUEST_TTL_MS = 2 * 60_000;
/** Android, Fire TV, phone, Windows and Mac apps can be sent to a title. */
export const SENDABLE_PLATFORMS = ['android', 'firetv', 'phone', 'windows', 'mac'] as const;

export function boxIsOn(lastSeenAt: string | null | undefined, now: number): boolean {
  if (!lastSeenAt) return false;
  const t = Date.parse(lastSeenAt);
  return Number.isFinite(t) && now - t <= BOX_ON_WINDOW_MS;
}
export function requestIsFresh(createdAt: string, now: number): boolean {
  return now - Date.parse(createdAt) <= WATCH_REQUEST_TTL_MS;
}
