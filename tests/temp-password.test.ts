import { expect, test } from "bun:test";
import { canSendTempPassword, generateTempPassword } from "../src/lib/temp-password";

test("only admin and management can email a new password", () => {
  expect(canSendTempPassword(["admin"])).toBe(true);
  expect(canSendTempPassword(["management"])).toBe(true);
  expect(canSendTempPassword(["staff", "moderator", "member"])).toBe(false);
});

test("temporary passwords are 12 readable characters", () => {
  const pw = generateTempPassword();
  expect(pw).toHaveLength(12);
  expect(pw).not.toMatch(/[0O1lI]/);
});
