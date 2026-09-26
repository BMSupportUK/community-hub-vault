import { parseSportsListingBlock, type SportsListingEvent } from "./sports-listing-format";

/** Public guides are an allowlist of event fields, never arbitrary body lines. */
export function publicGuideEvents(body: string): { date: string | null; time: string; title: string }[] {
  return parseSportsListingBlock(body)
    .filter((event) => safePublicEventTitle(event))
    .map(({ date, time, title }) => ({ date, time, title }));
}

/** Fail closed if a channel was accidentally parsed as the event name. */
export function safePublicEventTitle(event: SportsListingEvent): boolean {
  const title = event.title.trim();
  if (!title || /^(?:under team channels|[a-z]{1,6}\s?\d{1,3})$/i.test(title)) return false;
  return !event.channels.some((channel) => channel.trim().toLowerCase() === title.toLowerCase());
}