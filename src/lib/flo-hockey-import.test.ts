// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, it } from "bun:test";
import { parseSportsListingBlock } from "./sports-listing-format";
import { checkSportsImport } from "./sports-import-check";

const post = `**CA | Flo Hockey**

Flo Hockey 003: Panthers U10 vs Eagles U10 (Home) | 2026-11-26 01:15 PM EST
Flo Hockey 051: DM Flyers U12 vs Islanders U12 (Home) | 2026-11-26 04:35 PM EST`;

describe("Flo Hockey import", () => {
  it("reads channel, event and dated EST time", () => {
    const [first] = parseSportsListingBlock(post);
    expect(first?.channels).toEqual(["Flo Hockey 003"]);
    expect(first?.title).toBe("Panthers U10 v Eagles U10 (Home)");
    expect(first?.time).toBe("01:15 PM EST");
  });
  it("passes the import double-check, including a team starting with DM", () => {
    expect(checkSportsImport(post, "uk" as never, Date.parse("2026-11-26T12:00:00Z")).issues).toEqual([]);
  });
});
