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
  if (
    !title ||
    /^(?:[A-Za-z]{1,6}\d{1,3}|(?:channel|WF|NFL|NBA|NHL|MLB|MLS|WNBA|EFL)\s*\d{1,3})(?:\s+(?:HD|UHD|FHD|4K))?$/i.test(title) ||
    /^under team channels$/i.test(title) ||
    /\b(?:https?:\/\/|www\.|t\.me\/|discord\.gg\/|@everyone|@here)\b/i.test(title) ||
    /^(?:join|subscribe|follow|visit|click|download|contact|message|dm|use our|check out|watch live|all times|source:|posted by)\b/i.test(title)
  ) return false;
  return !event.channels.some((channel) => channel.trim().toLowerCase() === title.toLowerCase());
}

/** Shared by imports and manual saves: refuse channel/title changes on read-back. */
export function assertStableSportsListing(events: SportsListingEvent[], formatted: string): void {
  const signature = (rows: SportsListingEvent[]) => JSON.stringify(rows.map(({ date, time, endDate, endTime, title, channels }) => ({
    date, time, endDate, endTime, title, channels,
  })));
  if (events.some((event) => !safePublicEventTitle(event)) || signature(events) !== signature(parseSportsListingBlock(formatted))) {
    throw new Error("Save stopped: an event name or channel could change when this guide is reopened. Correct the listing before saving.");
  }
}