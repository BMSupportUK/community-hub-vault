import { describe, expect, test } from "bun:test";
import { newResetCode, newResetToken, resetLinkAlive, RESET_NUMBER_TRIES } from "../src/lib/player-2fa-reset";

describe("BM Player 2FA help link", () => {
  test("each link address is unique", () => {
    const a = newResetToken(), b = newResetToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
  test("reset code is 8 digits", () => expect(newResetCode()).toMatch(/^\d{8}$/));
  test("link dies once confirmed, replaced or expired", () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    expect(resetLinkAlive({ status: "open", expires_at: later })).toBe(true);
    expect(resetLinkAlive({ status: "done", expires_at: later })).toBe(false);
    expect(resetLinkAlive({ status: "expired", expires_at: later })).toBe(false);
    expect(resetLinkAlive({ status: "open", expires_at: new Date(Date.now() - 1).toISOString() })).toBe(false);
  });
  test("five wrong account numbers", () => expect(RESET_NUMBER_TRIES).toBe(5));
});
