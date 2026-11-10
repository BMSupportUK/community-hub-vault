import { expect, test } from "bun:test";
import { isBareSportsPassChannel, parseSportsListingBlock } from "../src/lib/sports-listing-format";

test("Stan feeds without a number are excluded while numbered channels survive guide read-back", () => {
  const excluded = ["Stan", "Stan Sport", "Stan Sports", "Stan Sport HD", "Australia: Stan Sport", "AU Stan Sports"];
  const retained = ["Stan 01", "Stan Sport 2", "Stan Sports 03 HD", "Stan Event S1", "Australia: Stan Sport 04"];
  for (const channel of excluded) expect(isBareSportsPassChannel(channel)).toBe(true);
  for (const channel of retained) expect(isBareSportsPassChannel(channel)).toBe(false);
  const events = parseSportsListingBlock(["Tuesday, 10th November", "12:00 GMT", "Team A v Team B", ...excluded, ...retained].join("\n"));
  expect(events).toHaveLength(1);
  expect(events[0]?.channels).toEqual(retained);
});