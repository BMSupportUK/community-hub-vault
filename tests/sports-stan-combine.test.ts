import { expect, test } from "bun:test";
import { dedupeSportsListingHtml, parseSportsListingBlock } from "../src/lib/sports-listing-format";

const toHtml = (lines: string[]) => lines.map((l) => `<div>${l || "<br>"}</div>`).join("");

const stan = toHtml([
  "Wednesday, 14th October", "",
  "03:59 BST", "Wuhan: Day 3 - WTA 1000", "Stan event 01", "",
  "04:00 BST", "Wuhan: Day 3 - WTA 1000", "Stan Event S1", "",
  "04:00 BST", "Wuhan: Day 3 - WTA 1000", "Stan 1 HD", "",
  "17:40 BST", "LASK v Liverpool - UEFA Champions League", "Stan 1 HD", "",
  "17:40 BST", "Feyenoord v Como - UEFA Champions League", "Stan 2 HD", "",
  "17:40 BST", "LASK v Liverpool - UEFA Champions League", "Stan event 01",
]);

test("Stan Sport: same event on several channels becomes one entry with every channel", () => {
  const out = dedupeSportsListingHtml(stan, "Stan Sports");
  expect(out).not.toBeNull();
  const events = parseSportsListingBlock(out!);
  expect(events).toHaveLength(3);
  const wuhan = events.find((e) => e.title.startsWith("Wuhan"))!;
  expect(wuhan.time.startsWith("04:00")).toBe(true);
  expect(wuhan.channels).toHaveLength(3);
  const lask = events.find((e) => e.title.startsWith("LASK"))!;
  expect(lask.channels).toEqual(["Stan 1 HD", "Stan event 01"]);
  expect(events.find((e) => e.title.startsWith("Feyenoord"))!.channels).toEqual(["Stan 2 HD"]);
});

test("Other guides keep the same event on different channels as separate entries", () => {
  const html = toHtml(["Wednesday, 14th October", "", "17:40 BST", "LASK v Liverpool", "TNT Sport 1", "", "17:40 BST", "LASK v Liverpool", "Stan 1 HD"]);
  expect(dedupeSportsListingHtml(html, "Champions League")).toBeNull();
});
