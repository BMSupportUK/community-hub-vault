// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with 'bun test'.
import { describe, expect, test } from "bun:test";
import { isSustainedConnectionExcess } from "./player-connection-limit";

const now = 1_000_000_000;
describe("BM Player connection limit", () => {
  test("reports after three continuous minutes over the maximum", () => {
    expect(isSustainedConnectionExcess({ active: 3, max: 2, exceededSince: now - 180_000, now })).toBe(true);
  });
  test("does not report before three minutes", () => {
    expect(isSustainedConnectionExcess({ active: 3, max: 2, exceededSince: now - 179_999, now })).toBe(false);
  });
  test("being at the maximum is allowed", () => {
    expect(isSustainedConnectionExcess({ active: 2, max: 2, exceededSince: now - 600_000, now })).toBe(false);
  });
});