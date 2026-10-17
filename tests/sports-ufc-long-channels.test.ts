import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { mergeSportsListingBlocks, parseSportsListingBlock } from "../src/lib/sports-listing-format";

const nowMs = Date.parse("2026-10-17T09:20:00Z");
const ufc = readFileSync(new URL("./fixtures-ufc-edmonton-2026-10-17.txt", import.meta.url), "utf8");
const peacock = readFileSync(new URL("./fixtures-peacock-cut-2026-10-17.txt", import.meta.url), "utf8");

test("UFC Edmonton long channel list never turns UFC Fightpass into an event name", () => {
  const r = checkSportsImport(ufc, "gmt", nowMs);
  expect(r.errors).toBe(0);
  expect(r.warnings).toBe(0);
  expect(r.events).toEqual([
    { date: "Saturday, 17th October", time: "22:00 BST", title: "UFC Edmonton : Early Prelims", channels: ["UFC Fightpass"] },
    { date: "Saturday, 17th October", time: "23:00 BST", title: "UFC Edmonton : Prelims", channels: ["TNT Sports 1", "UFC Fightpass", "Supersport Action", "Supersport Grandstand"] },
    { date: "Sunday, 18th October", time: "01:00 BST", title: "UFC Edmonton : Buckley v Malott", channels: ["TNT Sports 1", "Ten 2", "UFC Fightpass", "Supersport Action", "Supersport Grandstand"] },
  ]);
  expect(parseSportsListingBlock(mergeSportsListingBlocks("", r.formatted ?? "", { sourceZone: "gmt" }, nowMs))).toEqual(r.events);
});

test("Peacock post cut off after a title never lists that fixture as a channel", () => {
  const r = checkSportsImport(peacock, "gmt", nowMs);
  expect(r.errors).toBe(0);
  expect(r.events).toHaveLength(12);
  expect(r.events.at(-1)).toEqual({ date: "Saturday, 17th October", time: "14:50 BST", title: "Goal Rush: Matchweek 7", channels: ["PEACOCK 9 HD"] });
});
