import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { checkSportsImport } from "../src/lib/sports-import-check";

const raw = readFileSync(new URL("./fixtures-florugby-2026-10-17.txt", import.meta.url), "utf8");

describe("FloRugby rows with and without a colon after the brand", () => {
  const r = checkSportsImport(raw, "gmt", Date.parse("2026-10-17T08:00:00Z"));
  test("all 11 events, no issues", () => {
    expect(r.events.length).toBe(11);
    expect(r.issues).toEqual([]);
  });
  test("colon rows pair with their own channel", () => {
    const bulls = r.events.find((e) => e.title.includes("Vodacom Bulls"))!;
    expect(bulls.title).toBe("2026 Vodacom Bulls v Stade Francais");
    expect(bulls.channels).toEqual(["FLORUGBY 0"]);
    expect(bulls.time.startsWith("14:00")).toBe(true);
    const lions = r.events.find((e) => e.title.includes("Black Lion"))!;
    expect(lions.channels).toEqual(["FLORUGBY 3"]);
  });
});
