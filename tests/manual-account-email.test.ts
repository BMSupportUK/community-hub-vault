import { expect, test } from "bun:test";
import { TEMPLATES } from "../src/lib/email-templates/registry";

// Manually added accounts get their own editable email, separate from
// "Email new password", so the admin can word them independently.
test("manual add-user uses its own email template, separate from temporary-password", () => {
  expect(TEMPLATES["manual-account-login"]).toBeDefined();
  expect(TEMPLATES["temporary-password"]).toBeDefined();
  expect(TEMPLATES["manual-account-login"]).not.toBe(TEMPLATES["temporary-password"]);
});

test("manual add-user email subject is the welcome/login-details wording", () => {
  expect(TEMPLATES["manual-account-login"]!.subject).toBe("🎉 Your BM Support login details");
});

test("manual add-user email exposes the placeholders the send provides", () => {
  const previewData = TEMPLATES["manual-account-login"]!.previewData ?? {};
  expect(Object.keys(previewData).sort()).toEqual(["displayName", "email", "loginUrl", "password"]);
});
