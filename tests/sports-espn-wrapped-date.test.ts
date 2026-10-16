import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { mergeSportsListingBlocks, parseSportsListingBlock, plainListingToHtml } from "../src/lib/sports-listing-format";

const raw = readFileSync(new URL("./fixtures-espn-2026-10-16.txt", import.meta.url), "utf8");
const nowMs = Date.parse("2026-10-16T07:00:00Z");

test("ESPN slot date wrapped across lines keeps UCF v Houston separate", () => {
  const result = checkSportsImport(raw, "gmt", nowMs, "ESPN+");
  expect(result.errors).toBe(0);
  expect(result.warnings).toBe(0);
  expect(result.events).toHaveLength(157);
  expect(result.events).toContainEqual({ date: "Friday, 16th October", time: "23:25 BST", title: "UCF v Houston", channels: ["ESPN 1 HD"] });
  expect(result.events).toContainEqual({ date: "Friday, 16th October", time: "22:25 BST", title: "Grand Slam of Curling: CO-OP Invitational", channels: ["ESPN 0 HD"] });
  expect(parseSportsListingBlock(result.formatted)).toEqual(result.events);
  const saved = mergeSportsListingBlocks(plainListingToHtml(""), raw, { sourceZone: "gmt", guideTitle: "ESPN+", channels: [] }, nowMs);
  expect(parseSportsListingBlock(saved)).toHaveLength(157);
});