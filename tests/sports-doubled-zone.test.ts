import { expect, test } from "bun:test";
import { checkSportsImport } from "../src/lib/sports-import-check";

test("doubled 'UK UK' kick-off label still reads as one EPL fixture", () => {
  const raw = "Newcastle Utd v Everton\n\n8:00pm UK UK | 3:00pm ET\n\nEPL | Premier League\n\nSky Sports Main Event\n\nUSA Network";
  const r = checkSportsImport(raw, "uk" as never, Date.parse("2026-11-02T09:00:00Z"), "English Premier League TV Channels");
  expect(r.errors).toBe(0);
  expect(r.events.length).toBe(1);
  expect(r.events[0].title).toBe("Newcastle Utd v Everton");
  expect(r.events[0].time).toBe("20:00 GMT");
});
