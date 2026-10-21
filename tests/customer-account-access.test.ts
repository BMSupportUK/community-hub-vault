import { expect, test } from "bun:test";
import { canSwitchCustomerAccount, canSelectOrderSiteUser, isSwitchableCustomer } from "../src/lib/customer-account-access";

test("only admin can log in as a customer", () => {
  expect(canSwitchCustomerAccount(["admin"])).toBe(true);
  for (const role of ["management", "staff", "moderator", "member"]) expect(canSwitchCustomerAccount([role])).toBe(false);
});
test("admin and management can choose site users for manual orders", () => {
  expect(canSelectOrderSiteUser(["admin"])).toBe(true);
  expect(canSelectOrderSiteUser(["management"])).toBe(true);
  expect(canSelectOrderSiteUser(["staff"])).toBe(false);
});
test("customer switching cannot obtain staff privileges or enter blocked accounts", () => {
  expect(isSwitchableCustomer(["subscriber"])).toBe(true);
  for (const role of ["admin", "management", "staff", "moderator", "banned", "pending", "rejected"]) expect(isSwitchableCustomer(["subscriber", role])).toBe(false);
  expect(isSwitchableCustomer(["boro_fan_zone_member"])).toBe(false);
});