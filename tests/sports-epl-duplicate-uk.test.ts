import { expect, test } from "bun:test";
import { cardRawForEplEvent, normalizeSportsListingText, parseSportsListingBlock, sortSportsListingEvents, splitFixtureChannelBlocks, splitListingSections } from "../src/lib/sports-listing-format";
import { checkSportsImport } from "../src/lib/sports-import-check";

const raw = await Bun.file(new URL("./fixtures-epl-2026-11-07.txt", import.meta.url)).text();
const split = () => sortSportsListingEvents(parseSportsListingBlock(splitFixtureChannelBlocks(normalizeSportsListingText(raw))));

test("today's EPL post keeps four fixtures with three separate channel sections each despite UK/UK typo", () => {
  const events = split();
  expect(events).toHaveLength(12);
  expect(splitListingSections(raw).map(s => s.name)).toEqual([
    "Leeds United v Tottenham Hotspur", "Arsenal v Hull City", "Fulham v Newcastle United", "Nottingham Forest v Manchester City",
  ]);
  for (const title of ["Leeds United v Tottenham Hotspur", "Arsenal v Hull City", "Fulham v Newcastle United", "Nottingham Forest v Manchester City"]) {
    expect(events.filter(e => e.title === title)).toHaveLength(3);
  }
  const forest = events.filter(e => e.title === "Nottingham Forest v Manchester City");
  expect(forest.map(e => e.channels)).toEqual([
    ["Nottingham Forest EPL ˢᴰ", "Manchester City EPL ˢᴰ"],
    ["Fubo Sports", "Stan Sport", "Now HK 1", "MonoMax"],
    ["Sky Sports Premier League UK", "Sky Sports Main Event", "Sky Sports 8 NZ", "Supersport Premier League", "NBC US"],
  ]);
});

test("all twelve EPL split cards retain their own fixture, kick-off and channels on read-back", () => {
  const events = split();
  expect(events).toHaveLength(12);
  for (const event of events) {
    expect(parseSportsListingBlock(cardRawForEplEvent(event))).toEqual([event]);
  }
  const result = checkSportsImport(raw, "gmt", Date.UTC(2026, 10, 7, 9), "English Premier League");
  expect(result.errors).toBe(0);
  const forest = result.events.filter(e => e.title.includes("Nottingham Forest v Manchester City"));
  expect(forest).toHaveLength(3);
  expect(forest.map(e => e.time)).toEqual(["17:30 GMT", "17:30 GMT", "17:30 GMT"]);
});