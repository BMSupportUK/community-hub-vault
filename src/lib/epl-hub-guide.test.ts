import { expect, test } from "bun:test";
import { parseSportsListingBlock, splitFixtureChannelBlocks } from "./sports-listing-format";

const post = `# PREMIER LEAGUE

\`Sunday, 22nd November\`

## Hull City v Brighton
2:00pm UK / 9:00am ET

EPL | Premier League
Hull City | EPL ˢᴰ
Brighton | EPL ˢᴰ

EPL | Premier League Hub
Fubo Sports
Astro Premier League 2
Hub Premier 1
MonoMax

Sky Sports Main Event
USA Network
`;

test("Hub Premier guide gets only the Premier League Hub channels for each fixture", () => {
  const ev = parseSportsListingBlock(splitFixtureChannelBlocks(post, { hubOnly: true }));
  expect(ev.length).toBe(1);
  expect(ev[0]?.title).toBe("Hull City v Brighton");
  expect(ev[0]?.channels).toEqual(["Fubo Sports", "Astro Premier League 2", "Hub Premier 1", "MonoMax"]);
});

test("TV Channels guide still keeps Hub and Sky channels on one card", () => {
  const ev = parseSportsListingBlock(splitFixtureChannelBlocks(post));
  expect(ev[0]?.channels).toContain("Hub Premier 1");
  expect(ev[0]?.channels).toContain("Sky Sports Main Event");
});
