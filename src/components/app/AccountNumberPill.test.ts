// @ts-nocheck — tests run with bun test.
import { expect, test } from "bun:test";
import { accountNumberPillLabel } from "./AccountNumberPill";

test("header pill says Staff for staff roles", () => {
  expect(accountNumberPillLabel(["staff"])).toBe("Staff");
  expect(accountNumberPillLabel(["admin"])).toBe("Staff");
  expect(accountNumberPillLabel(["management"])).toBe("Staff");
  expect(accountNumberPillLabel(["moderator"])).toBe("Staff");
});

test("header pill says Customer Account for members", () => {
  expect(accountNumberPillLabel(["member"])).toBe("Customer Account");
  expect(accountNumberPillLabel([])).toBe("Customer Account");
});
