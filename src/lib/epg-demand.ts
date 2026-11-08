import { feedsFor } from './real-epg';

/** Country category only; synthetic categories must never wake every feed. */
export function categoryFeeds(category: string): string[] {
  return feedsFor('', category.trim());
}
export const EPG_SUCCESS_TTL_MS = 6 * 3600_000;
export function refreshNeeded(successfulAt: string | null, nowMs: number): boolean {
  return !successfulAt || !Number.isFinite(Date.parse(successfulAt)) || nowMs - Date.parse(successfulAt) >= EPG_SUCCESS_TTL_MS;
}