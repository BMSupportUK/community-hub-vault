// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { test, expect } from "bun:test";
import { isClubChannelGuide } from "./sports-listing-format";
test("club guides", () => {
  for (const t of ["iFollow", "SPFL fixtures", "Scottish Premiership", "Scottish League One", "Scotland Premier League Channels"]) expect(isClubChannelGuide(t)).toBe(true);
  for (const t of ["Six Nations: Scotland v France", "Scottish Cup", "Royal Ascot"]) expect(isClubChannelGuide(t)).toBe(false);
});
