import { expect, test } from "bun:test";
import { canRequestPasswordReset, canSendTempPassword, generateTempPassword } from "../src/lib/temp-password";
import { passwordChangeInput, passwordChoiceAccepted } from "../src/lib/password-reset";

test("only admin can request a customer password reset", () => {
  expect(canRequestPasswordReset(["admin"])).toBe(true);
  for (const role of ["management", "staff", "moderator", "member"]) expect(canRequestPasswordReset([role])).toBe(false);
});

test("signed-in password changes require the current password", () => {
  expect(passwordChangeInput("new-value", "old-value", false)).toEqual({ password: "new-value", current_password: "old-value" });
});

test("recovery changes never send the current password", () => {
  expect(passwordChangeInput("new-value", "old-value", true)).toEqual({ password: "new-value" });
});

test("customers can confirm the same password to complete a reset request", () => {
  expect(passwordChangeInput("existing-password", "existing-password", false)).toEqual({ password: "existing-password", current_password: "existing-password" });
  expect(passwordChoiceAccepted({ code: "same_password", message: "New password should be different." })).toBe(true);
  expect(passwordChoiceAccepted(null)).toBe(true);
});

test("other password failures never complete a reset request", () => {
  for (const code of ["invalid_credentials", "weak_password", "reauthentication_needed"]) {
    expect(passwordChoiceAccepted({ code, message: "Password rejected" })).toBe(false);
  }
  expect(passwordChoiceAccepted({ message: "Network failure" })).toBe(false);
});

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
