// @ts-nocheck — tests run with bun test.
import { expect, test } from "bun:test";
import { accountNumberPillLabel } from "./account-number-label";

test("caption above the number says the account for staff roles", () => {
  expect(accountNumberPillLabel(["staff"])).toBe("Your staff account");
  expect(accountNumberPillLabel(["admin"])).toBe("Your staff account");
  expect(accountNumberPillLabel(["management"])).toBe("Your staff account");
  expect(accountNumberPillLabel(["moderator"])).toBe("Your staff account");
});

test("caption above the number says the account for members", () => {
  expect(accountNumberPillLabel(["member"])).toBe("Your account");
  expect(accountNumberPillLabel([])).toBe("Your account");
});
