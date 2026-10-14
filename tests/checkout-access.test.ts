import { describe, expect, it } from "bun:test";
import { canViewStaffCheckout, canCompleteCheckoutSteps } from "../src/lib/checkout-access";
describe("staff secure checkout permissions", () => {
  it("allows staff checkout viewing, chat and link sharing, but not members", () => {
    expect(canViewStaffCheckout(["staff"])).toBe(true);
    expect(canViewStaffCheckout(["member", "subscriber"])).toBe(false);
    expect(canViewStaffCheckout(["boro_fan_zone_moderator"])).toBe(false);
  });
  it("prohibits staff advancing or completing checkout steps", () => {
    expect(canCompleteCheckoutSteps(["staff"])).toBe(false);
    expect(canCompleteCheckoutSteps(["staff", "subscriber"])).toBe(false);
    expect(canCompleteCheckoutSteps(["moderator"])).toBe(false);
  });
  it("preserves admin and management completion access", () => {
    expect(canCompleteCheckoutSteps(["admin", "staff"])).toBe(true);
    expect(canCompleteCheckoutSteps(["management", "staff"])).toBe(true);
  });
});
