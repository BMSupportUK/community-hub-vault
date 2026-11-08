import { eventListings, toListing } from './real-epg';
import { providerGuideFallback } from './provider-epg-policy';
export type FixtureEpgEvent = { title: string; start: number; end?: number; channels: string[]; competition?: string };
/** Website fixture slots only. No country XMLTV reads or downloads. */
export function sportsFixtureEpg(channel: string, events: FixtureEpgEvent[], now = Date.now()) {
  const key = channel.trim().toLowerCase();
  if (!events.some(e => e.channels.some(c => c.trim().toLowerCase() === key))) return providerGuideFallback();
  return { epg_listings: eventListings(channel, events, now - 3 * 3600_000, now + 36 * 3600_000).map(toListing), source: 'sports' as const };
}