// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, it } from "bun:test";
import { parseSportsListingBlock } from "./sports-listing-format";
import { checkSportsImport } from "./sports-import-check";

const post = `**UK | TNT Sports**

HBO Max UK 2 | UEFA Europa League and Conference League Highlights UEL Matchday 5 | UECL Matchday 4 // UK Thu 26 Nov 10:30pm // ET Thu 26 Nov 5:30pm
HBO Max UK 3 | Judgement Day UK Championship | Qualifying // UK Thu 26 Nov 6:50pm // ET Thu 26 Nov 1:50pm`;

describe("HBO Max import", () => {
  it("keeps numbered qualifiers in the event name, not as channels", () => {
    const [first] = parseSportsListingBlock(post);
    expect(first?.channels).toEqual(["HBO Max UK 2"]);
    expect(first?.title).toBe("UEFA Europa League and Conference League Highlights UEL Matchday 5: UECL Matchday 4");
  });
  it("passes the import double-check", () => {
    expect(checkSportsImport(post, "uk" as never, Date.parse("2026-11-26T11:00:00Z")).issues).toEqual([]);
  });
});
