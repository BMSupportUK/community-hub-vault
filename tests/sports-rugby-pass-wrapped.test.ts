import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { parseSportsListingBlock } from "../src/lib/sports-listing-format";
import { checkSportsImport } from "../src/lib/sports-import-check";

const raw = readFileSync(new URL("./fixtures-rugby-pass-2026-10-10.txt", import.meta.url), "utf8");
const nowMs = Date.parse("2026-10-10T09:30:00Z");

describe("Rugby Pass post with a fixture wrapped over two lines", () => {
  test("wrapped fixture is joined and keeps its channel", () => {
    const events = parseSportsListingBlock(raw);
    expect(events).toHaveLength(11);
    const c = events.find((e) => e.title === "Clermont Auvergne v Bordeaux Begles");
    expect(c?.time).toBe("20:00");
    expect(c?.channels).toEqual(["Rugby Pass 02"]);
    expect(events.find((e) => e.title === "Lyon v La Rochelle")?.channels).toEqual(["Rugby Pass 02"]);
  });
  test("every event has a channel and the saved guide reads back the same", () => {
    const res = checkSportsImport(raw, "gmt", nowMs, "Rugby Pass");
    expect(res.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(res.issues.some((i) => /no channel/i.test(i.message))).toBe(false);
  });
});
