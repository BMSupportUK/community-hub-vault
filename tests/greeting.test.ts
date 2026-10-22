import { expect, test } from "bun:test";
import { dayBand, greetingFor, ukHour } from "../src/lib/greeting";

test("5am to before noon is morning", () => {
  expect(dayBand(5)).toBe("morning");
  expect(dayBand(11)).toBe("morning");
  expect(dayBand(4)).toBe("evening");
});
test("noon to before 6pm is afternoon", () => {
  expect(dayBand(12)).toBe("afternoon");
  expect(dayBand(17)).toBe("afternoon");
});
test("6pm onward is evening", () => {
  expect(dayBand(18)).toBe("evening");
  expect(greetingFor(23)).toBe("Good evening");
});
test("uses UK time, not UTC", () => {
  // 22 Oct 2026 11:30 UTC = 12:30 BST
  expect(ukHour(new Date("2026-10-22T11:30:00Z"))).toBe(12);
});
