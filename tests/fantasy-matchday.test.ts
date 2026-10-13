import { describe, expect, test } from "bun:test";
import { isFantasyPreGame, matchdayMembership } from "../src/lib/fantasy-matchday";

describe("official weekly matchday membership", () => {
  const official = new Set(["starter", "unused-sub"]);
  test("an unused official substitute belongs to the matchday squad", () => {
    expect(matchdayMembership("unused-sub", official, 0)).toBe("named");
  });
  test("a player outside both XI and bench is absent", () => {
    expect(matchdayMembership("omitted", official, 0)).toBe("absent");
  });
  test("missing or incomplete team news cannot establish absence", () => {
    expect(matchdayMembership("omitted", null, 0)).toBe("unknown");
  });
  test("actual playing time establishes membership even without team news", () => {
    expect(matchdayMembership("substitute", null, 3)).toBe("named");
  });
});

describe("fantasy pre-game state", () => {
  const gameweek = { kickoffAt: "2026-10-13T19:00:00Z", status: "locked", fixtureStatus: "SCHEDULED" };
  test("a locked XI and bench remain pre-game before the 20:00 UK kick-off", () => {
    expect(isFantasyPreGame(gameweek, Date.parse("2026-10-13T18:07:00Z"))).toBe(true);
  });
  test("pre-game ends at kick-off, even while the fixture feed is stale", () => {
    expect(isFantasyPreGame(gameweek, Date.parse("2026-10-13T19:00:00Z"))).toBe(false);
  });
  test("a live match is not pre-game even if the scheduled time is later", () => {
    expect(isFantasyPreGame({ ...gameweek, fixtureStatus: "IN_PLAY" }, Date.parse("2026-10-13T18:07:00Z"))).toBe(false);
  });
  test("a finalised match is never pre-game", () => {
    expect(isFantasyPreGame({ ...gameweek, status: "final" }, Date.parse("2026-10-13T18:07:00Z"))).toBe(false);
  });
});