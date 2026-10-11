import { describe, expect, test } from "bun:test";
import { canManageStaffPins, isStaffPinHolder } from "../src/lib/staff-pin-admin-access";

describe("staff PIN reveal access", () => {
  test("only admin and management may reveal staff PINs", () => {
    expect(canManageStaffPins(["admin"])).toBe(true);
    expect(canManageStaffPins(["management"])).toBe(true);
    for (const roles of [[], ["staff"], ["moderator"], ["user"], ["member"], ["fan_zone_moderator"]]) {
      expect(canManageStaffPins(roles)).toBe(false);
    }
  });
  test("only staff accounts are eligible targets", () => {
    for (const role of ["admin", "management", "staff", "moderator"]) expect(isStaffPinHolder([role])).toBe(true);
    expect(isStaffPinHolder(["member"])).toBe(false);
    expect(isStaffPinHolder([])).toBe(false);
  });
});