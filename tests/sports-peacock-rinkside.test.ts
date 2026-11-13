import { expect, test } from "bun:test";
import { formatSportsListingBlock, mergeSportsListingBlocks, parseSportsListingBlock } from "../src/lib/sports-listing-format";

const nowMs = Date.parse("2026-11-13T07:53:00Z");
const source = "Thursday, 12th November\nRinkside Live: Womens\n- 12-11-2026 10:45 PM until 13-11-2026 12:35 AM - PEACOCK 4 HD";

test("Peacock Rinkside retains its supplied channel when yesterday's listing merges with today", () => {
  const formatted = formatSportsListingBlock({ raw: source, sourceZone: "gmt", nowMs });
  const merged = mergeSportsListingBlocks(formatted ?? "", "Friday, 13th November\n09:00 GMT\nWorld Cup SS: Beijing 1\nPEACOCK 0 HD", { sourceZone: "gmt" }, nowMs);
  expect(parseSportsListingBlock(merged).find(event => event.title === "Rinkside Live: Womens")?.channels).toEqual(["PEACOCK 4 HD"]);
});

test("Peacock Rinkside preserves the supplied overnight finish on saved read-back", () => {
  const formatted = formatSportsListingBlock({ raw: source, sourceZone: "gmt", nowMs });
  const event = parseSportsListingBlock(formatted)[0];
  expect(event?.endDate).toBe("13/11/2026");
  expect(event?.endTime).toBe("00:35 GMT");
});