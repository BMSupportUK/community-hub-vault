import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { mergeSportsListingBlocks, parseSportsListingBlock } from "../src/lib/sports-listing-format";

const raw = readFileSync(new URL("./fixtures-afl-2026-10-16.txt", import.meta.url), "utf8");
const nowMs = Date.parse("2026-10-16T09:43:00Z");

test("AFL mistyped ET meridiem keeps Melbourne at the stated UK clock with all channels", () => {
  const result = checkSportsImport(raw, "gmt", nowMs);
  expect(result.errors).toBe(0);
  expect(result.warnings).toBe(0);
  expect(result.events).toHaveLength(5);
  expect(result.events).toContainEqual({ date: "Friday, 16th October", time: "09:15 BST", title: "Melbourne v Richmond", channels: ["TNT Sports 4", "Fox Footy 504", "Sky Sport 7", "Fox Sports 2"] });
});

test("AFL backslash dual-time separator keeps Carlton separate from Adelaide", () => {
  const result = checkSportsImport(raw, "gmt", nowMs);
  expect(result.events).toContainEqual({ date: "Saturday, 17th October", time: "05:05 BST", title: "Carlton v Western Bulldogs", channels: ["TNT Sports 3", "Fox Footy 504"] });
  expect(result.events).toContainEqual({ date: "Saturday, 17th October", time: "03:05 BST", title: "Adelaide v Gold Coast", channels: ["TNT Sports 3", "Fox Sports 504"] });
  expect(result.events).toContainEqual({ date: "Saturday, 17th October", time: "07:05 BST", title: "Brisbane v Port Adelaide", channels: ["TNT Sports 3", "Fox Footy 504"] });
  expect(result.events).toContainEqual({ date: "Friday, 16th October", time: "09:15 BST", title: "West Coast v Geelong", channels: ["Fox Footy 504"] });
  expect(parseSportsListingBlock(result.formatted)).toEqual(result.events);
  expect(parseSportsListingBlock(mergeSportsListingBlocks("", raw, { sourceZone: "gmt" }, nowMs))).toEqual(result.events);
});