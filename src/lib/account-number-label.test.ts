// @ts-nocheck — tests run with bun test.
import { expect, test } from "bun:test";
import { accountNumberPillLabel } from "./account-number-label";

test("caption above the number reads Your Account Number for staff roles", () => {
  expect(accountNumberPillLabel(["staff"])).toBe("Your Account Number");
  expect(accountNumberPillLabel(["admin"])).toBe("Your Account Number");
  expect(accountNumberPillLabel(["management"])).toBe("Your Account Number");
  expect(accountNumberPillLabel(["moderator"])).toBe("Your Account Number");
});

test("caption above the number reads Your Account Number for members", () => {
  expect(accountNumberPillLabel(["member"])).toBe("Your Account Number");
  expect(accountNumberPillLabel([])).toBe("Your Account Number");
});
