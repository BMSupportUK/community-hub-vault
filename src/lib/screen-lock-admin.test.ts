// @ts-ignore -- Bun provides the test runtime.
import { expect, test } from "bun:test";
import { screenLockAdminBypass } from "./screen-lock-admin";
import { portalAdminPinBypass } from "./portal-admin-access";

const now = Date.parse("2026-11-12T10:00:00Z");
const audit = { customer_id: "customer", returned_at: null, expires_at: "2026-11-12T11:00:00Z" };
test("verified admin viewing a locked customer bypasses only that viewer's screen", () => {
  const grant = { userId: "customer", expiresAt: portalAdminPinBypass(audit, "customer", ["admin"], now) ? audit.expires_at : null };
  expect(screenLockAdminBypass(grant, "customer", now)).toBe(true);
  expect(screenLockAdminBypass(null, "customer", now)).toBe(false);
});
test("other viewers and expired or returned switches cannot bypass the lock", () => {
  expect(screenLockAdminBypass({ userId: "customer", expiresAt: audit.expires_at }, "other", now)).toBe(false);
  expect(screenLockAdminBypass({ userId: "customer", expiresAt: audit.expires_at }, "customer", Date.parse(audit.expires_at))).toBe(false);
  expect(portalAdminPinBypass({ ...audit, returned_at: audit.expires_at }, "customer", ["admin"], now)).toBe(false);
});