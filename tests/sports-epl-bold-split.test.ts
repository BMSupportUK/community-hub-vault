import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { normalizeSportsListingText, parseSportsListingBlock, sortSportsListingEvents, splitFixtureChannelBlocks, splitListingSections } from "../src/lib/sports-listing-format";

const raw = readFileSync(new URL("./fixtures-epl-bold-2026-10-17.txt", import.meta.url), "utf8");

test("bold Premier League post with pipe times splits into 3 listings per fixture", () => {
  expect(splitListingSections(raw).map((s) => s.name)).toEqual(["Everton v Chelsea", "Brentford v Liverpool", "Fulham v Hull", "Manchester City v Ipswich", "Newcastle v Aston Villa"]);
  const events = sortSportsListingEvents(parseSportsListingBlock(splitFixtureChannelBlocks(normalizeSportsListingText(raw))));
  expect(events).toHaveLength(15);
  expect(events.filter((e) => e.title === "Everton v Chelsea").map((e) => e.channels)).toEqual([
    ["Everton EPL ˢᴰ", "Chelsea EPL ˢᴰ"],
    ["TNT Sports 1", "Fubo Sports 2", "Now HK 1", "Hub Premier 1", "MonoMax"],
    ["beIN Sports English 1", "Supersport Premier League", "USA Network"],
  ]);
});

test("bold Premier League post imports cleanly", () => {
  const r = checkSportsImport(raw, "gmt", Date.UTC(2026, 9, 17, 9), "English Premier League");
  expect(r.errors).toBe(0);
  expect(r.events).toHaveLength(15);
  expect(r.events.filter((e) => e.title.includes("Everton v Chelsea")).every((e) => e.time.startsWith("12:30"))).toBe(true);
});
