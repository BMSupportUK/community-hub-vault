// @ts-ignore -- Bun provides the test runtime; app types exclude Bun globals.
import { expect, test } from "bun:test";
import { portalProfileCredentials } from "./portal-profile-credentials";

const rows = [
  { id: "original", app_login_name: "Wobbly8Garden", password: "test-original", expiry_at: null, account_type: "single" },
  { id: "selected", app_login_name: "Coordinated4Audience", password: "test-selected", expiry_at: null, account_type: "multi" },
];
test("side-rail credentials show only the selected profile's current login", () => {
  expect(portalProfileCredentials(rows, "selected")).toEqual([
    { id: "selected", login: "Coordinated4Audience", password: "test-selected", expiresAt: null, accountType: "multi" },
  ]);
});
test("a different user's or missing profile never falls back to original credentials", () => {
  expect(portalProfileCredentials(rows, "other-user")).toEqual([]);
  expect(portalProfileCredentials(rows, null)).toEqual([]);
});