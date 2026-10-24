import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { checkSportsImport } from "../src/lib/sports-import-check";

const raw = readFileSync(new URL("./fixtures-florugby-event-colon-2026-10-24.txt", import.meta.url), "utf8");

describe("FloRugby rows with 'Event0:' instead of 'Event0 name:'", () => {
  const r = checkSportsImport(raw, "gmt", Date.parse("2026-10-24T08:00:00Z"));
  test("all 13 events with channels, no issues", () => {
    expect(r.events.length).toBe(13);
    expect(r.issues).toEqual([]);
  });
  test("each row keeps its own channel", () => {
    const bulls = r.events.find((e) => e.title.includes("Vodacom Bulls"))!;
    expect(bulls.title).toBe("2026 Vodacom Bulls v Ulster Rugby");
    expect(bulls.channels).toEqual(["FLORUGBY 0"]);
    expect(r.events.find((e) => e.title.includes("Ospreys"))!.channels).toEqual(["FLORUGBY 9"]);
  });
});
