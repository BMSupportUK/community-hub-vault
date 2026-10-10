import { expect, test } from "bun:test";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { formatSportsListingBlock, parseSportsListingBlock } from "../src/lib/sports-listing-format";

const raw = `<div>Saturday, 10th October</div><div><br></div><div>15:00 BST</div><div>Dundee United v Hibernian</div><div><br></div><div>15:00 BST</div><div>Falkirk v Dundee</div><div><br></div><div>15:00 BST</div><div>Hearts v St. Mirren</div><div><br></div><div>15:00 BST</div><div>Rangers v Kilmarnock</div>`;
const nowMs = Date.UTC(2026, 9, 10, 9, 14);

test("Scottish Premier League Streams gives every fixture Under Team Channels and survives read-back", () => {
  const result = checkSportsImport(raw, "gmt", nowMs, "Scotland Premier League Streams");
  expect(result.issues).toEqual([]);
  expect(result.events).toHaveLength(4);
  expect(result.events.map((e) => e.title)).toEqual([
    "Dundee United v Hibernian", "Falkirk v Dundee", "Hearts v St. Mirren", "Rangers v Kilmarnock",
  ]);
  for (const event of result.events) {
    expect(event.channels).toEqual(["Under Team Channels"]);
    expect(event.time).toBe("15:00 BST");
    expect(event.date).toBe("Saturday, 10th October");
  }
  const again = formatSportsListingBlock({ raw: result.formatted ?? "", guideTitle: "Scotland Premier League Streams", sourceZone: "gmt", nowMs });
  expect(parseSportsListingBlock(again ?? "")).toEqual(result.events);
});

test("Scottish team channel label preserves supplied feeds without duplication", () => {
  const result = checkSportsImport("Saturday, 10th October\n15:00 BST\nRangers v Kilmarnock\nRangers TV | Under Team Channels", "gmt", nowMs, "Scotland Premier League Streams");
  expect(result.errors).toBe(0);
  expect(result.events[0]?.channels).toEqual(["Rangers TV", "Under Team Channels"]);
});

test("Other Scottish guides do not gain the Streams team channel label", () => {
  const result = checkSportsImport(raw, "gmt", nowMs, "Scotland Premier League Channels");
  expect(result.events).toHaveLength(4);
  expect(result.events.every((e) => e.channels.length === 0)).toBe(true);
});