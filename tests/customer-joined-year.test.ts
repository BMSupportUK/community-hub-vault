import { test, expect } from "bun:test";
import { customerJoinedYear, customerYearsFromYear, joinedYearToDate } from "../src/lib/customer-joined-year";

test("year-only tenure does not depend on an unknown anniversary", () => {
  const now = new Date("2026-10-17T19:31:00Z");
  expect(customerJoinedYear("2020-12-31T12:00:00Z")).toBe(2020);
  expect(customerYearsFromYear(2020, now)).toBe(6);
});
test("admin supplies just a year for backdating", () => {
  expect(joinedYearToDate("2018", new Date("2026-10-17T19:31:00Z"))).toBe("2018-01-01");
});
test("reject future years and full date entries", () => {
  const now = new Date("2026-10-17T19:31:00Z");
  expect(joinedYearToDate("2027", now)).toBeNull();
  expect(joinedYearToDate("2020-05-17", now)).toBeNull();
});
test("missing history stays unknown and current year reads zero", () => {
  expect(customerJoinedYear(null)).toBeNull();
  expect(customerYearsFromYear(null)).toBeNull();
  expect(customerYearsFromYear(2026, new Date("2026-10-17T19:31:00Z"))).toBe(0);
});