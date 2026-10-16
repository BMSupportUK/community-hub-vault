import { expect, test } from "bun:test";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { parseSportsListingBlock } from "../src/lib/sports-listing-format";

const RAW = "**FR | Ligue 1**\n\nLigue 1 Match 1 19:45 Le Mans vs Toulouse";

test("pipe-less Ligue 1 channel row imports with its own channel", () => {
  const r = checkSportsImport(RAW, "gmt", Date.parse("2026-10-16T09:00:00Z"));
  expect(r.errors).toBe(0);
  expect(r.warnings).toBe(0);
  expect(r.events).toHaveLength(1);
  expect(r.events[0]!.time).toContain("19:45");
  expect(r.events[0]!.title).toContain("Le Mans v Toulouse");
  expect(r.events[0]!.channels).toEqual(["Ligue 1 Match 1"]);
  expect(parseSportsListingBlock(r.formatted!)).toEqual(r.events);
});
