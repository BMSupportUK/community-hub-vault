import { describe, expect, it } from "bun:test";
import { passwordUnlockMatches, screenUnlockAwaitingMfa, screenUnlockRequiresMfa } from "../src/lib/screen-lock-password";

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

describe("role-based screen unlock 2FA", () => {
  const now = 1_800_000_000_000;
  const fresh = { aal: "aal2", amr: [{ method: "totp", timestamp: now / 1000 - 2 }] };

  it("requires 2FA for Admin", () => expect(screenUnlockRequiresMfa(["admin"])).toBe(true));
  it("requires 2FA for Staff", () => expect(screenUnlockRequiresMfa(["staff"])).toBe(true));
  it("requires 2FA for Moderators", () => expect(screenUnlockRequiresMfa(["moderator"])).toBe(true));
  it("keeps Management password-only", () => expect(screenUnlockRequiresMfa(["management"])).toBe(false));
  it("keeps Management exempt when the account also has a Staff role", () => {
    expect(screenUnlockRequiresMfa(["staff", "management"])).toBe(false);
  });
  it("does not add 2FA for customers", () => {
    expect(screenUnlockRequiresMfa(["subscriber"])).toBe(false);
  });
  it("never unlocks Admin or Staff on the password-only step, even with an earlier fresh code", () => {
    expect(screenUnlockAwaitingMfa(["admin"], false, fresh, now)).toBe(true);
    expect(screenUnlockAwaitingMfa(["staff"], false, fresh, now)).toBe(true);
  });
  it("accepts a freshly submitted authenticator code for Admin, Staff and Moderators", () => {
    expect(screenUnlockAwaitingMfa(["admin"], true, fresh, now)).toBe(false);
    expect(screenUnlockAwaitingMfa(["staff"], true, fresh, now)).toBe(false);
    expect(screenUnlockAwaitingMfa(["moderator"], true, fresh, now)).toBe(false);
  });
  it("rejects a stale code and keeps Management password-only", () => {
    const stale = { aal: "aal2", amr: [{ method: "totp", timestamp: now / 1000 - 61 }] };
    expect(screenUnlockAwaitingMfa(["admin"], true, stale, now)).toBe(true);
    expect(screenUnlockAwaitingMfa(["management"], false, {}, now)).toBe(false);
  });
});
