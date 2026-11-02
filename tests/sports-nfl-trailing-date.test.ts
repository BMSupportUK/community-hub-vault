import { expect, test } from "bun:test";
import { parseSportsListingBlock } from "../src/lib/sports-listing-format";

test("NFL row with trailing dd/mm date imports as one event", () => {
  const events = parseSportsListingBlock("NFL\n\nNFL14: Bears @ Seahawks 01:15 03/11");
  expect(events).toHaveLength(1);
  expect(events[0].title).toBe("Bears @ Seahawks");
  expect(events[0].time).toBe("01:15");
  expect(events[0].channels).toEqual(["NFL 14"]);
  expect(events[0].date).toContain("3");
});
