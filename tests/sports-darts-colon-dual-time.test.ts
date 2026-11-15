import { expect, test } from "bun:test";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { parseSportsListingBlock, mergeSportsListingBlocks } from "../src/lib/sports-listing-format";

const raw = `**VIP | Darts**

PDC Event 1: Grand Slam Of Darts, Day 2 Afternoon // UK Sun 15 Nov 12:55pm // ET Sun 15 Nov 7:55am
PDC Event 1: Grand Slam Of Darts, Day 2 Evening // UK Sun 15 Nov 6:55pm // ET Sun 15 Nov 1:55pm`;
const nowMs = Date.parse("2026-11-15T10:01:00Z");

test("Darts keeps both sessions at their stated UK times on PDC Event 1", () => {
  const result = checkSportsImport(raw, "gmt", nowMs);
  expect(result.issues).toEqual([]);
  expect(result.events).toEqual([
    { date: "Sunday, 15th November", time: "12:55 GMT", title: "Grand Slam Of Darts, Day 2 Afternoon", channels: ["PDC Event 1"] },
    { date: "Sunday, 15th November", time: "18:55 GMT", title: "Grand Slam Of Darts, Day 2 Evening", channels: ["PDC Event 1"] },
  ]);
});

test("Darts sessions retain titles, times and channel through saved and merged read-back", () => {
  const result = checkSportsImport(raw, "gmt", nowMs);
  expect(result.formatted).not.toBeNull();
  expect(parseSportsListingBlock(result.formatted)).toEqual(result.events);
  expect(parseSportsListingBlock(mergeSportsListingBlocks("", result.formatted ?? "", { sourceZone: "gmt" }, nowMs))).toEqual(result.events);
});