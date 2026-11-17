// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { parseSportsListingBlock } from "./sports-listing-format";
const raw = `NHL 01: 7pm ET | 12am UK
Kings @ Bruins
NHL 02: 7pm Oilers ET | 12am UK
@ Panthers
NHL 03: 7pm ET | 12am UK
Blue Jackets @ Islanders`;
describe("NHL team name pasted inside the time", () => {
  const events = parseSportsListingBlock(raw);
  test("keeps the matchup whole", () => expect(events.map((e) => e.title)).toContain("Oilers @ Panthers"));
  test("no event title carries the time", () => expect(events.some((e) => /7pm|ET \|/.test(e.title))).toBe(false));
  test("all three games imported", () => expect(events.length).toBe(3));
});
