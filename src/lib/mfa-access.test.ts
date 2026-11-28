// @ts-nocheck — Bun test types are not part of the application typecheck.
import { expect, test } from "bun:test";
import { mfaAccessState, mfaRecoveryActionAllowed } from "./mfa-access";

test("restored password-only session cannot bypass required 2FA", () => {
  expect(mfaAccessState("aal1", "aal2", null)).toBe("challenge");
  expect(mfaAccessState(null, "aal2", null)).toBe("challenge");
});
test("completed 2FA remains accepted during the same app launch", () => {
  expect(mfaAccessState("aal2", "aal2", null, true)).toBe("allowed");
});
test("a fresh app opening challenges again even when the saved session is AAL2", () => {
  expect(mfaAccessState("aal2", "aal2", null, false)).toBe("challenge");
});
test("accounts without an enrolled factor retain their existing access", () => {
  expect(mfaAccessState("aal1", "aal1", null)).toBe("allowed");
});
test("failed and unresolved checks fail closed", () => {
  expect(mfaAccessState("aal1", "aal1", new Error("offline"))).toBe("error");
  expect(mfaAccessState(null, null, null)).toBe("error");
});
test("pending 2FA permits recovery only, not profile or admin actions", () => {
  expect(mfaRecoveryActionAllowed("requestMfaReset")).toBe(true);
  expect(mfaRecoveryActionAllowed("listMyMfaFactors")).toBe(true);
  expect(mfaRecoveryActionAllowed("restoreStaffProfile")).toBe(false);
  expect(mfaRecoveryActionAllowed("getProfileAccess")).toBe(false);
  expect(mfaRecoveryActionAllowed("resetUserMfa")).toBe(false);
});