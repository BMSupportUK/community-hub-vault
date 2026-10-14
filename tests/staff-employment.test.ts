import { expect, test } from "bun:test";
import { staffEmploymentGroup, validateStaffDates } from "../src/lib/staff-employment";
test("staff who have left appear only in the former staff group even if roles remain", () => {
  expect(staffEmploymentGroup(["staff"], { leave_date: "2026-10-14", roles: ["staff"] })).toBe("former");
});
test("former staff remain listed after their staff roles are removed", () => {
  expect(staffEmploymentGroup([], { leave_date: "2026-10-14", roles: ["management"] })).toBe("former");
});
test("current staff are separated by highest staff role", () => {
  expect(staffEmploymentGroup(["staff", "management"])).toBe("management");
  expect(staffEmploymentGroup(["subscriber"])).toBeNull();
});
test("date left cannot precede date joined", () => {
  expect(validateStaffDates("2026-10-10", "2026-10-09", "2026-10-14")).not.toBeNull();
  expect(validateStaffDates("2026-10-10", "2026-10-14", "2026-10-14")).toBeNull();
});