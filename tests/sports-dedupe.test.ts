import { expect, test } from "bun:test";
import { dedupeSportsListingHtml, mergeSportsListingBlocks, parseSportsListingBlock } from "../src/lib/sports-listing-format";

const toHtml = (lines: string[]) => lines.map((l) => `<div>${l || "<br>"}</div>`).join("");

test("same event listed twice is removed before saving", () => {
  const html = toHtml(["03-10-2026","","20:55 BST","UFC FIGHTPASS: UFC 332: PRELIMS","UFC 2 HD","","20:55 BST","UFC FIGHTPASS: UFC 332: PRELIMS","UFC 2 HD","","22:55 BST","UFC FIGHTPASS: UFC 332: MAIN CARD","UFC 1 HD"]);
  const out = dedupeSportsListingHtml(html);
  expect(out).not.toBeNull();
  expect(parseSportsListingBlock(out!)).toHaveLength(2);
});

test("same fixture re-imported with different wording in the same slot is kept once", () => {
  const html = toHtml(["Saturday, 10th October","","08:30 BST","SOUTH AFRICA v AUSTRALIA: DAY 2","Sky Sports Cricket","","08:30 BST","ICC TEST MATCH: SOUTH AFRICA v AUSTRALIA","Sky Sports Cricket"]);
  const out = dedupeSportsListingHtml(html);
  expect(out).not.toBeNull();
  const events = parseSportsListingBlock(out!);
  expect(events).toHaveLength(1);
  expect(events[0].title).toBe("SOUTH AFRICA v AUSTRALIA: DAY 2");
});

test("re-importing a reworded fixture into a guide does not add it again", () => {
  const existing = toHtml(["Saturday, 10th October","","08:30 BST","SOUTH AFRICA v AUSTRALIA: DAY 2","Sky Sports Cricket"]);
  const incoming = ["Saturday, 10th October","","08:30 BST","ICC TEST MATCH: SOUTH AFRICA v AUSTRALIA","Sky Sports Cricket"].join("\n");
  const now = Date.parse("2026-10-10T07:00:00Z");
  const merged = mergeSportsListingBlocks(existing, incoming, { channels: [] } as never, now);
  expect(parseSportsListingBlock(merged!)).toHaveLength(1);
});

test("same fixture on different channels stays as two entries", () => {
  const html = toHtml(["Saturday, 10th October","","08:30 BST","SOUTH AFRICA v AUSTRALIA: DAY 2","Sky Sports Cricket","","08:30 BST","ICC TEST MATCH: SOUTH AFRICA v AUSTRALIA","Willow TV"]);
  expect(dedupeSportsListingHtml(html)).toBeNull();
});

test("different fixtures in the same slot and channel both stay", () => {
  const html = toHtml(["Saturday, 10th October","","15:00 BST","Chelsea v Bournemouth","Channel 5","","15:00 BST","Fulham v Ipswich Town","Channel 5"]);
  expect(dedupeSportsListingHtml(html)).toBeNull();
});
