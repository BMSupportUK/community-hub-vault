import { expect, test } from "bun:test";
import { cardRawForEplEvent, normalizeSportsListingText, parseSportsListingBlock, splitFixtureChannelBlocks } from "../src/lib/sports-listing-format";

// Actual pending EPL post from 23 November: one fixture, three source groups.
const raw = `# PREMIER LEAGUE



\`Monday, 23rd November\`




## Brentford v Everton
8:00pm UK / 3:00pm ET

EPL | Premier League
Brentford | EPL ˢᴰ
Everton | EPL ˢᴰ

EPL | Premier League Hub
Fubo Sports
Stan Sport
Hub Premier 1
MonoMax

Sky Sports Main Event
Sky Sports Premier League UK
Sky Sports 8 NZ
Supersport Premier League
USA Network`;

test("today's EPL queue split creates three separately fileable channel cards", () => {
  const events = parseSportsListingBlock(splitFixtureChannelBlocks(normalizeSportsListingText(raw), { separateGroups: true }));
  expect(events).toHaveLength(3);
  expect(events.map(e => e.channels)).toEqual([
    ["Brentford EPL ˢᴰ", "Everton EPL ˢᴰ"],
    ["Fubo Sports", "Hub Premier 1", "MonoMax"],
    ["Sky Sports Main Event", "Sky Sports Premier League UK", "Sky Sports 8 NZ", "Supersport Premier League", "USA Network"],
  ]);
  for (const event of events) {
    expect(event.title).toBe("Brentford v Everton");
    expect(event.date).toBe("Monday, 23rd November");
    expect(event.time).toBe("8:00pm UK");
    expect(parseSportsListingBlock(cardRawForEplEvent(event))).toEqual([event]);
  }
});

test("public EPL parsing still combines all channel groups into one fixture", () => {
  const events = parseSportsListingBlock(splitFixtureChannelBlocks(raw));
  expect(events).toHaveLength(1);
  expect(events[0]?.channels).toHaveLength(10);
});