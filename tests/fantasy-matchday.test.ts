import { describe, expect, test } from "bun:test";
import { matchdayMembership } from "../src/lib/fantasy-matchday";

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