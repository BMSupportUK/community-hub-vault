import { expect, test } from "bun:test";
import { formatSportsListingBlock, mergeSportsListingBlocks, parseSportsListingBlock, plainListingToHtml, pruneStaleSportsListingHtml } from "../src/lib/sports-listing-format";

const nowMs = Date.parse("2026-11-12T10:14:24Z");
const raw = "**UK | FA Player | Women's Football**\n\nWF01: 17:45 Barcelona vs Arsenal\nWF02: 20:00 Benfica vs. Austria Wien";

test("today's Women's Champions League post keeps each match and its own WF channel through saved read-back", () => {
  const formatted = formatSportsListingBlock({ raw, sourceZone: "gmt", nowMs });
  expect(parseSportsListingBlock(formatted)).toEqual([
    { date: "Thursday, 12th November", time: "17:45 GMT", title: "Barcelona v Arsenal", channels: ["WF01"] },
    { date: "Thursday, 12th November", time: "20:00 GMT", title: "Benfica v Austria Wien", channels: ["WF02"] },
  ]);
  const html = plainListingToHtml(formatted ?? "");
  expect(parseSportsListingBlock(html)).toEqual(parseSportsListingBlock(formatted));
  expect(pruneStaleSportsListingHtml(html, nowMs)).toBeNull();
  const merged = mergeSportsListingBlocks("", formatted ?? "", { guideTitle: "UEFA Womens Champions League Streams" }, nowMs);
  expect(parseSportsListingBlock(merged)).toEqual(parseSportsListingBlock(formatted));
});

test("other compact provider codes cannot steal the following event title", () => {
  for (const code of ["XY", "NFL", "WF"]) {
    const events = parseSportsListingBlock(`12 November\n17:45 GMT\nAlpha v Beta\n${code}01\n20:00 GMT\nGamma v Delta\n${code}02`);
    expect(events.map(e => ({ title: e.title, channels: e.channels }))).toEqual([
      { title: "Alpha v Beta", channels: [`${code}01`] },
      { title: "Gamma v Delta", channels: [`${code}02`] },
    ]);
  }
});