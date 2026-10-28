import { describe, expect, test } from "bun:test";
import { INSTALL_NO_EXPIRY_ISO, enablerReferenceUsed } from "./enabler-confirm-code";

describe("install references", () => {
  test("install codes don't run out", () => {
    expect(Date.parse(INSTALL_NO_EXPIRY_ISO)).toBeGreaterThan(Date.parse("2090-01-01"));
  });
  test("a used or logged install code unlocks New code", () => {
    expect(enablerReferenceUsed({ kind: "install", used_at: "2026-10-28T17:00:00Z", bound_ticket_id: null, bound_order_id: null })).toBe(true);
    expect(enablerReferenceUsed({ kind: "install", used_at: null, bound_ticket_id: null, bound_order_id: null })).toBe(false);
  });
  test("sharing references never unlock early", () => {
    expect(enablerReferenceUsed({ kind: "share", used_at: "2026-10-28T17:00:00Z", bound_ticket_id: "t", bound_order_id: null })).toBe(false);
  });
});
