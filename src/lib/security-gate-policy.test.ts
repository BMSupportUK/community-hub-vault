// @ts-expect-error Bun supplies test types at runtime in this project.
import { describe, expect, it } from "bun:test";
import { gateExpiry, gateOpen } from "./security-gate-policy";

describe("sensitive gate expiry", () => {
  const now = Date.UTC(2026, 10, 27, 17, 0);
  it("orders expire after fifteen minutes", () => expect(gateExpiry("shop-orders", now)).toBe("2026-11-27T17:15:00.000Z"));
  it("discounts expire after fifteen minutes", () => expect(gateExpiry("discounts", now)).toBe("2026-11-27T17:15:00.000Z"));
  it("player expires after ten idle minutes", () => expect(gateExpiry("player", now)).toBe("2026-11-27T17:10:00.000Z"));
  it("expired and malformed grants remain closed", () => {
    expect(gateOpen("2026-11-27T17:00:00Z", now)).toBe(false);
    expect(gateOpen("invalid", now)).toBe(false);
    expect(gateOpen(null, now)).toBe(false);
    expect(gateOpen("2026-11-27T17:00:01Z", now)).toBe(true);
  });
});