import { expect, test } from "bun:test";
import { isPreparingForShift } from "../src/lib/shift-start";

const slot = { shift_date: "2026-10-18", start_time: "10:00:00", end_time: "19:00:00" };
test("early sign-in prepares until the exact UK shift start", () => {
  const signedIn = "2026-10-18T08:45:00Z";
  expect(isPreparingForShift(Date.parse("2026-10-18T08:59:59Z"), signedIn, slot)).toBe(true);
  expect(isPreparingForShift(Date.parse("2026-10-18T09:00:00Z"), signedIn, slot)).toBe(false);
});
test("signed-out staff and unscheduled cover are not preparing", () => {
  expect(isPreparingForShift(Date.parse("2026-10-18T08:50:00Z"), null, slot)).toBe(false);
  expect(isPreparingForShift(Date.parse("2026-10-18T08:50:00Z"), "2026-10-18T08:45:00Z", null)).toBe(false);
});
test("a previous shift cannot prepare for a later slot or another day", () => {
  expect(isPreparingForShift(Date.parse("2026-10-18T08:50:00Z"), "2026-10-17T08:45:00Z", slot)).toBe(false);
  expect(isPreparingForShift(Date.parse("2026-10-18T10:00:00Z"), "2026-10-18T09:00:00Z", slot)).toBe(false);
});