// @ts-ignore -- Bun provides the test runtime; app types exclude Bun globals.
import { expect, test } from "bun:test";
import { portalAdminPinBypass } from "./portal-admin-access";

const now = Date.parse("2026-11-12T09:33:00Z");
const audit = { customer_id: "customer", returned_at: null, expires_at: "2026-11-12T10:33:00Z" };
test("admin viewing the switched customer's credentials skips the PIN", () => {
  expect(portalAdminPinBypass(audit, "customer", ["admin"], now)).toBe(true);
});
test("ordinary customer sessions still require their PIN", () => {
  expect(portalAdminPinBypass(null, "customer", ["member"], now)).toBe(false);
});
test("a switch for another customer cannot bypass the PIN", () => {
  expect(portalAdminPinBypass(audit, "other-customer", ["admin"], now)).toBe(false);
});
test("returned or expired admin switches cannot bypass the PIN", () => {
  expect(portalAdminPinBypass({ ...audit, returned_at: "2026-11-12T09:32:00Z" }, "customer", ["admin"], now)).toBe(false);
  expect(portalAdminPinBypass(audit, "customer", ["admin"], Date.parse(audit.expires_at))).toBe(false);
});
test("staff, management and revoked admin access do not bypass the PIN", () => {
  for (const roles of [["staff"], ["management"], ["moderator"], ["member"], []]) {
    expect(portalAdminPinBypass(audit, "customer", roles, now)).toBe(false);
  }
});