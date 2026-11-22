import { eventListings, toListing } from './real-epg';
import { providerGuideFallback } from './provider-epg-policy';
export type FixtureEpgEvent = { title: string; start: number; end?: number; channels: string[]; competition?: string };
/** Center Ice has two playlist sets for the same numbered fixtures. Only the stable
 * feed label before the pipe counts; never programme text or a different number. */
function centerIceNumber(channel: string): number | null {
  const label = channel.split('|')[0].trim();
  const hit = /^(?:US\s*:\s*)?NHL\s+(?:(?:Center|Centre)\s+Ice\s+)?(\d{1,3})$/i.exec(label);
  return hit ? Number(hit[1]) : null;
}
/** NFL Sunday Ticket feeds only ever carry listed games (no provider programmes worth keeping). */
export function eventOnlyFeed(channel: string): boolean {
  const n = channel.normalize('NFKD');
  return /^\s*(?:US\s*:\s*)?NFL\s+Sunday\s+Ticket\b/i.test(n);
}
/** Website fixture slots only. No country XMLTV reads or downloads. */
export function sportsFixtureEpg(channel: string, events: FixtureEpgEvent[], now = Date.now()) {
  const key = channel.trim().toLowerCase();
  const number = centerIceNumber(channel);
  const fixtures = events.map(e => {
    const exact = e.channels.some(c => c.trim().toLowerCase() === key);
    const sameFeed = number !== null && e.channels.some(c => centerIceNumber(c) === number);
    return exact || sameFeed ? { ...e, channels: [channel] } : e;
  });
  if (!fixtures.some(e => e.channels.some(c => c.trim().toLowerCase() === key))) {
    // Event-only feeds with no game today still get a guide row instead of a blank one.
    if (!eventOnlyFeed(channel)) return providerGuideFallback();
  }
  return { epg_listings: eventListings(channel, fixtures, now - 3 * 3600_000, now + 36 * 3600_000).map(toListing), source: 'sports' as const };
}
