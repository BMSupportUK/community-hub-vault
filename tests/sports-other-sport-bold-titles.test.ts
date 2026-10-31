import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { splitListingSections } from "../src/lib/sports-listing-format";

// Exact 31 October "OTHER SPORT" post: time line first, then a bold event title.
const raw = readFileSync(join(import.meta.dir, "fixtures/other-sport-bold-titles.txt"), "utf8");
const now = Date.UTC(2026, 9, 31, 12, 30);

test("bold event titles under their own time line are not split into provider sections", () => {
  expect(splitListingSections(raw)).toEqual([]);
});

test("every event keeps its own time, including the non-bold greyhounds and the last surfing slot", () => {
  const result = checkSportsImport(raw, "gmt", now);
  expect(result.errors).toBe(0);
  expect(result.events.map((e) => [e.title.split(":")[0], e.time])).toEqual([
    ["PDC DARTS", "09:00 GMT"],
    ["GREYHOUND RACING", "11:00 GMT"],
    ["HOTELPLANNER TOUR GOLF", "11:00 GMT"],
    ["PREMIER PADEL", "13:00 GMT"],
    ["SHORT TRACK SPEED SKATING", "17:30 GMT"],
    ["HORSE RACING", "18:00 GMT"],
    ["FIGURE SKATING", "19:00 GMT"],
    ["BMX RACING", "19:00 GMT"],
    ["SURFING", "22:30 GMT"],
  ]);
});
