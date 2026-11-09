// @ts-nocheck — tests run with bun test, matching the project's test convention.
import { expect, test } from "bun:test";
import { customerActionAllowed } from "./profile-access";

test("customer scope denies staff administration even for the original owner", () => {
  expect(customerActionAllowed("deleteMember")).toBe(false);
  expect(customerActionAllowed("unlockWithStaffPin")).toBe(false);
  expect(customerActionAllowed("startCustomerAccountSwitch")).toBe(false);
});
test("customer scope permits its own portal and password-gated profile return", () => {
  expect(customerActionAllowed("readPortalCredentials")).toBe(true);
  expect(customerActionAllowed("restoreStaffProfile")).toBe(true);
});
test("unregistered actions fail closed", () => {
  expect(customerActionAllowed("newPrivilegedAction")).toBe(false);
});