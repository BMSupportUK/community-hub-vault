// @ts-nocheck — tests run with bun test.
import { describe, expect, test } from "bun:test";
import { needsProfileChoice, pickActiveProfile, profileUsesStaffPortal } from "./account-profiles";

const a = { id: "a" };
const b = { id: "b" };

describe("account profiles", () => {
  test("staff primary profile opens staff portal", () => {
    expect(profileUsesStaffPortal(["admin"], { accountNumber: 1 })).toBe(true);
  });
  test("staff customer profile opens customer portal", () => {
    expect(profileUsesStaffPortal(["admin"], { accountNumber: 2 })).toBe(false);
  });
  test("customer primary profile cannot gain staff portal", () => {
    expect(profileUsesStaffPortal(["subscriber"], { accountNumber: 1 })).toBe(false);
  });
  test("saved profile is shown when it still exists", () => {
    expect(pickActiveProfile([a, b], "b")).toBe(b);
  });
  test("falls back to the first login when the saved one is gone", () => {
    expect(pickActiveProfile([a, b], "gone")).toBe(a);
  });
  test("chooser only opens with two or more logins", () => {
    expect(needsProfileChoice(1, false)).toBe(false);
    expect(needsProfileChoice(2, false)).toBe(true);
    expect(needsProfileChoice(2, true)).toBe(false);
  });
});
