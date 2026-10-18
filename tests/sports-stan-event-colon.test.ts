import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { checkSportsImport } from "../src/lib/sports-import-check";

const raw = readFileSync(new URL("./fixtures-stan-event-colon-2026-10-18.txt", import.meta.url), "utf8");

describe("Stan rows with the title straight after the slot (no name:)", () => {
  const r = checkSportsImport(raw, null, Date.parse("2026-10-18T10:30:00Z"));
  test("all 15 events, no issues", () => {
    expect(r.events.length).toBe(15);
    expect(r.issues).toEqual([]);
  });
  test("slot becomes the channel, title stays clean", () => {
    const wuhan = r.events.find((e) => e.title.includes("Wuhan"))!;
    expect(wuhan.title).toBe("Wuhan: Day 7 - WTA 1000");
    expect(wuhan.channels).toEqual(["Stan Event S1"]);
    expect(wuhan.time.startsWith("11:30")).toBe(true);
    const leeds = r.events.find((e) => e.title.startsWith("Leeds United"))!;
    expect(leeds.channels).toEqual(["Stan Event S2"]);
    const everton = r.events.find((e) => e.title.includes("Everton"))!;
    expect(everton.channels).toEqual(["Stan Event S10"]);
  });
});
