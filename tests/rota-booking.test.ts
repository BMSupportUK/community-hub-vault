import { test, expect } from "bun:test";
import { rotaDayClosed } from "../src/lib/rota-booking";
test("today's crossed-out rota day is closed even before shift start", () => {
  const now = Date.parse("2026-10-19T07:57:00Z");
  expect(rotaDayClosed("2026-10-19", now)).toBe(true);
  expect(rotaDayClosed("2026-10-18", now)).toBe(true);
  expect(rotaDayClosed("2026-10-20", now)).toBe(false);
});
test("booking cutoff follows UK midnight in summer and winter", () => {
  expect(rotaDayClosed("2026-10-19", Date.parse("2026-10-18T22:59:59Z"))).toBe(false);
  expect(rotaDayClosed("2026-10-19", Date.parse("2026-10-18T23:00:00Z"))).toBe(true);
  expect(rotaDayClosed("2026-12-19", Date.parse("2026-12-18T23:59:59Z"))).toBe(false);
  expect(rotaDayClosed("2026-12-19", Date.parse("2026-12-19T00:00:00Z"))).toBe(true);
});
