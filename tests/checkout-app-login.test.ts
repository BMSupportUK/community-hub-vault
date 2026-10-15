import { describe, expect, it } from "bun:test";
import { canViewCheckoutAppLogin } from "../src/lib/checkout-app-login";

describe("customer app login details on the secure checkout", () => {
  it("opens the app login details once payment and account setup are confirmed", () => {
    expect(canViewCheckoutAppLogin({ paid: true, cancelled: false, accountSetupAt: "2026-10-15T20:00:00Z" })).toBe(true);
  });
  it("keeps them hidden while payment is outstanding", () => {
    expect(canViewCheckoutAppLogin({ paid: false, cancelled: false, accountSetupAt: null })).toBe(false);
  });
  it("keeps them hidden while account setup is still in progress", () => {
    expect(canViewCheckoutAppLogin({ paid: true, cancelled: false, accountSetupAt: null })).toBe(false);
  });
  it("keeps them hidden on a cancelled order", () => {
    expect(canViewCheckoutAppLogin({ paid: true, cancelled: true, accountSetupAt: "2026-10-15T20:00:00Z" })).toBe(false);
  });
});
