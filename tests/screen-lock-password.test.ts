import { describe, expect, it } from "bun:test";
import { passwordUnlockMatches } from "../src/lib/screen-lock-password";

describe("account password screen unlock", () => {
  it("accepts successful account-password verification for the locked customer", () => {
    expect(passwordUnlockMatches("customer-a", "customer-a", null)).toBe(true);
  });
  it("rejects an incorrect account password", () => {
    expect(passwordUnlockMatches("customer-a", undefined, { code: "invalid_credentials" })).toBe(false);
  });
  it("cannot unlock a customer with another account's password", () => {
    expect(passwordUnlockMatches("customer-a", "customer-b", null)).toBe(false);
  });
  it("never unlocks after a failed or empty identity check", () => {
    expect(passwordUnlockMatches("customer-a", "customer-a", new Error("Unavailable"))).toBe(false);
    expect(passwordUnlockMatches("customer-a", undefined, null)).toBe(false);
    expect(passwordUnlockMatches("", "", null)).toBe(false);
  });
});