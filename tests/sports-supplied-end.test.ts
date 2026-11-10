import { expect, test } from "bun:test";
import { formatSportsListingBlock, parseSportsListingBlock } from "../src/lib/sports-listing-format";
import { applyGuideEnds, playerSportsEvents, sportsEventState } from "../src/lib/player-sports";
import { sportsFixtureEpg } from "../src/lib/sports-fixture-epg";

const now = Date.parse("2026-11-10T10:00:00Z");
const start = Date.parse("2026-11-10T20:00:00Z");
const end = Date.parse("2026-11-10T22:47:00Z");
const raw = "Derby v Bolton\n- 10-11-2026 8:00 PM until 10-11-2026 10:47 PM - MonoMax 11";
const guide = (body: string) => ({ title: "MonoMax", category: "Sports Passes", body });

test("any guide's supplied end survives import and feeds both player guides", () => {
  const saved = formatSportsListingBlock({ raw, sourceZone: "gmt", nowMs: now });
  expect(saved).not.toBeNull();
  const parsed = parseSportsListingBlock(saved);
  expect(parsed[0].endTime).toBe("22:47 GMT");
  const events = playerSportsEvents([guide(saved ?? "")], now);
  expect(events[0].end).toBe(end);
  expect(events[0].endSource).toBe("guide");
  expect(sportsEventState(events[0], end)).toBe("finished");
  const epg = sportsFixtureEpg("MonoMax 11", events, start);
  expect(epg.epg_listings?.find(p => atob(p.title) === "Derby v Bolton")?.stop_timestamp).toBe(end / 1000);
});

test("supplied finish cannot be overwritten by provider completion", () => {
  const events = playerSportsEvents([guide(raw)], now);
  const result = applyGuideEnds(events, new Map([["monomax 11", [{ title: "Derby v Bolton", start, end: end + 3600000 }]]]), now);
  expect(result[0].end).toBe(end);
});

test("ET overnight end retains its date after UK conversion and save", () => {
  const saved = formatSportsListingBlock({ raw: "Arsenal v Chelsea\n- 10-11-2026 11:00 PM until 11-11-2026 2:15 AM - Peacock 8 HD", sourceZone: "et", nowMs: now });
  const events = playerSportsEvents([{ ...guide(saved ?? ""), title: "Peacock" }], now);
  expect(events[0].start).toBe(Date.parse("2026-11-11T04:00:00Z"));
  expect(events[0].end).toBe(Date.parse("2026-11-11T07:15:00Z"));
});

test("merged competition and pass guides retain the supplied finish", () => {
  const events = playerSportsEvents([guide(raw), { title: "EFL", category: "Football", body: "Tuesday, 10th November\n20:00 GMT\nDerby v Bolton\nSky Sports Football" }], now);
  expect(events).toHaveLength(1);
  expect(events[0].end).toBe(end);
});

test("explicit prelim finish is not shortened by an estimate", () => {
  const events = playerSportsEvents([{ ...guide(raw.replace("Derby v Bolton", "UFC 300: Prelims")), title: "UFC" }], now);
  expect(events[0].end).toBe(end);
});