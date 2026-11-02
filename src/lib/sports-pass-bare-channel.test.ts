// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { isBareSportsPassChannel, parseSportsListingBlock } from "./sports-listing-format";

test("bare sports pass names are not channels", () => {
  expect(isBareSportsPassChannel("Coupang Play")).toBe(true);
  expect(isBareSportsPassChannel("Rugby Pass")).toBe(true);
  expect(isBareSportsPassChannel("Coupang Play 1")).toBe(false);
  expect(isBareSportsPassChannel("Sky Sports Main Event")).toBe(false);
});

test("listing drops a bare pass channel but keeps the fixture and numbered feed", () => {
  const ev = parseSportsListingBlock("20:00\nNewcastle v Everton\nCoupang Play | Coupang Play 2");
  expect(ev.length).toBe(1);
  expect(ev[0]!.channels).toEqual(["Coupang Play 2"]);
});
