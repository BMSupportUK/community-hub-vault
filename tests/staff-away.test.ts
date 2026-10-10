import { test, expect } from "bun:test";
import { awayWindow, awayIcon, awayElapsedLabel } from "../src/lib/staff-away";
import { Toilet, Cigarette, Users, Moon } from "lucide-react";

test("each Away reason has its own icon", () => {
  expect(awayIcon("Toilet Break")).toBe(Toilet);
  expect(awayIcon("Smoking Break")).toBe(Cigarette);
  expect(awayIcon("Meeting")).toBe(Users);
  expect(awayIcon("Outside Of Office Hours")).toBe(Moon);
  expect(awayIcon(null)).toBe(Moon);
});

for (const reason of ["Toilet Break", "Smoking Break", "Meeting"] as const) {
  test(`${reason} starts now and has no automatic end`, () => {
    expect(awayWindow(reason, 1000, 2000, 3000)).toEqual({ starts_at: new Date(3000).toISOString(), ends_at: null });
  });
}
test("Outside Of Office Hours keeps the chosen start and automatic finish", () => {
  expect(awayWindow("Outside Of Office Hours", 2000, 5000, 1000)).toEqual({ starts_at: new Date(2000).toISOString(), ends_at: new Date(5000).toISOString() });
  expect(() => awayWindow("Outside Of Office Hours", 5000, 2000, 1000)).toThrow();
});