import { expect, test } from "bun:test";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { parseSportsListingBlock, plainListingToHtml } from "../src/lib/sports-listing-format";

test("today's Cymru short channel names retain both fixtures, UK times and channels", () => {
  const raw = "**UK | Cymru TV**\n\nCymru 1 - Cardiff Met - Penybont [31st Oct - 12:25pm GMT]\nCymru 2 - The New Saints - Connah’s Quay Nomads [31st Oct - 5:05pm GMT]";
  const result = checkSportsImport(raw, "gmt", Date.UTC(2026, 9, 31, 10, 25));
  expect(result.errors).toBe(0);
  expect(result.events).toEqual([
    { date: "Saturday, 31st October", time: "12:25 GMT", title: "Cardiff Met v Penybont", channels: ["Cymru 1"] },
    { date: "Saturday, 31st October", time: "17:05 GMT", title: "The New Saints v Connah’s Quay Nomads", channels: ["Cymru 2"] },
  ]);
  expect(parseSportsListingBlock(plainListingToHtml(result.formatted ?? ""))).toEqual(result.events);
});