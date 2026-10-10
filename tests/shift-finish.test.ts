import { test, expect } from "bun:test";
import { shiftFinishAction } from "../src/lib/shift-finish";

test("mid-shift Clock Out requires approval rather than ending the shift", () => {
  expect(shiftFinishAction(Date.parse("2026-10-10T12:10:00Z"), "19:00:00", false)).toBe("request");
});

test("a pending early finish cannot be requested again or end the shift", () => {
  expect(shiftFinishAction(Date.parse("2026-10-10T12:10:00Z"), "19:00:00", true)).toBe("wait");
});

test("Clock Out unlocks at the UK rota end regardless of device timezone", () => {
  expect(shiftFinishAction(Date.parse("2026-10-10T17:59:59Z"), "19:00:00", false)).toBe("request");
  expect(shiftFinishAction(Date.parse("2026-10-10T18:00:00Z"), "19:00:00", false)).toBe("clock-out");
});

test("unloaded or failed rota checks cannot allow Clock Out", () => {
  expect(shiftFinishAction(Date.parse("2026-10-10T12:10:00Z"), null, false, false)).toBe("wait");
});