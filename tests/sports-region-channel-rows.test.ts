import { describe, expect, test } from "bun:test";
import { formatSportsListingBlock, mergeSportsListingBlocks, parseSportsListingBlock } from "../src/lib/sports-listing-format";

// Horse Racing post of 13 Nov 2026: saving it into the guide moved
// "Ireland: Virgin One" off Cheltenham and onto the Bahrain event as its title.
const raw = "Friday, 13th November\n1:30pm UK HORSE RACING: Cheltenham\nIreland: Virgin One\n3:30pm UK HORSE RACING: Bahrain\nIreland: Virgin Three";

describe("country-labelled channel rows", () => {
  test("each horse racing event keeps its own Irish channel after saving into the guide", () => {
    const now = Date.parse("2026-11-13T08:18:00Z");
    const imported = formatSportsListingBlock({ raw, guideTitle: "Horse Racing", nowMs: now } as any)!;
    const merged = mergeSportsListingBlocks("", imported, { guideTitle: "Horse Racing" } as any, now)!;
    const events = parseSportsListingBlock(merged);
    expect(events.map((e) => [e.time, e.title, e.channels])).toEqual([
      ["13:30 GMT", "HORSE RACING: Cheltenham", ["Ireland: Virgin One"]],
      ["15:30 GMT", "HORSE RACING: Bahrain", ["Ireland: Virgin Three"]],
    ]);
  });

  test("re-saving the guide a second time changes nothing", () => {
    const now = Date.parse("2026-11-13T08:18:00Z");
    const once = mergeSportsListingBlocks("", formatSportsListingBlock({ raw, guideTitle: "Horse Racing", nowMs: now } as any)!, { guideTitle: "Horse Racing" } as any, now)!;
    const twice = mergeSportsListingBlocks(once, "", { guideTitle: "Horse Racing" } as any, now)!;
    expect(twice).toBe(once);
  });
});
