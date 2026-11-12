import { expect, test } from "bun:test";
import { assertStableSportsListing, safePublicEventTitle } from "../src/lib/public-guide-safety";
import { formatSportsListingEvents, parseSportsListingBlock, plainListingToHtml } from "../src/lib/sports-listing-format";

test("every compact provider code preserves independent programme names and channels through save and read-back", () => {
  for (const code of ["WF", "NFL", "NBA", "NHL", "MLB", "MLS", "WNBA", "EFL", "XY", "LOI", "SPFL"]) {
    for (const suffix of ["", " HD", " UHD", " FHD", " 4K"]) {
      const events = parseSportsListingBlock(`12 November\n17:45 GMT\nOpening coverage\n${code}01${suffix}\n20:00 GMT\nEvening coverage\n${code}02${suffix}`);
      expect(events.map(({title, channels}) => ({title, channels}))).toEqual([
        {title: "Opening coverage", channels: [`${code}01${suffix}`]},
        {title: "Evening coverage", channels: [`${code}02${suffix}`]},
      ]);
      const html = plainListingToHtml(formatSportsListingEvents(events, {}));
      expect(() => assertStableSportsListing(events, html)).not.toThrow();
    }
  }
});

test("imports and manual saves reject a channel as the event title, even with another valid channel", () => {
  for (const title of ["WF01", "XY01", "NFL 02", "Channel 03", "WF01 HD"]) {
    const event = {date: "12 November", time: "20:00 GMT", title, channels: ["WF02"]};
    expect(safePublicEventTitle(event)).toBe(false);
    expect(() => assertStableSportsListing([event], plainListingToHtml(formatSportsListingEvents([event], {})))).toThrow();
  }
});

test("save validation rejects a changed channel and retains valid numbered programme names", () => {
  const event = {date: "12 November", time: "20:00 GMT", title: "Formula 1", channels: ["Sky Sports F1"]};
  expect(safePublicEventTitle(event)).toBe(true);
  expect(() => assertStableSportsListing([event], plainListingToHtml(formatSportsListingEvents([{...event, channels: ["Sky Sports 2"]}], {})))).toThrow();
});