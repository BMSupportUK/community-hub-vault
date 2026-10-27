import { test, expect } from "bun:test";
import { enablerReferenceUsed, confirmationActive, confirmCodeState, makeConfirmCode, normalizeConfirmCode, CONFIRM_TTL_MS } from "../src/lib/enabler-confirm-code";

test("reference use includes either ticket or order binding, without exposing its scope", () => {
  const unused = { used_at: null, bound_ticket_id: null, bound_order_id: null };
  expect(enablerReferenceUsed(unused)).toBe(false);
  expect(enablerReferenceUsed({ ...unused, bound_ticket_id: "ticket" })).toBe(true);
  expect(enablerReferenceUsed({ ...unused, bound_order_id: "order" })).toBe(true);
  expect(enablerReferenceUsed({ ...unused, used_at: "2026-10-27T08:07:00Z" })).toBe(true);
});

const now = new Date("2026-10-26T12:00:00Z");
const row = (o: Partial<{ device: string; expires_at: string; used_at: string | null }> = {}) =>
  ({ device: "android", expires_at: new Date(now.getTime() + CONFIRM_TTL_MS).toISOString(), used_at: null, ...o });

test("code lasts 24 hours", () => {
  expect(CONFIRM_TTL_MS).toBe(24 * 60 * 60 * 1000);
  expect(confirmCodeState(row({ expires_at: new Date(now.getTime() - 1).toISOString() }), "android", now)).toBe("invalid");
  expect(confirmCodeState(row(), "android", now)).toBe("ok");
});
test("customer code entry remains locked for the full reference lifetime, even after TV checks were consumed", () => {
  const expiresAt = "2026-10-27T12:00:00Z";
  expect(confirmationActive(expiresAt, Date.parse("2026-10-27T11:59:59Z"))).toBe(true);
  expect(confirmationActive(expiresAt, Date.parse("2026-10-27T12:00:00Z"))).toBe(false);
  expect(confirmationActive(null, now.getTime())).toBe(false);
});
test("code remains usable after first submission for the full 24 hours", () => {
  const used = row({ used_at: now.toISOString() });
  expect(confirmCodeState(used, "android", new Date(now.getTime() + CONFIRM_TTL_MS - 1))).toBe("ok");
  expect(confirmCodeState(used, "android", new Date(now.getTime() + CONFIRM_TTL_MS))).toBe("invalid");
});
test("other TV type is rejected", () => {
  expect(confirmCodeState(row({ device: "amazon" }), "android", now)).toBe("device_mismatch");
});
test("codes are 6 characters and typing is forgiving", () => {
  expect(makeConfirmCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  expect(normalizeConfirmCode("k7p-4qx")).toBe("K7P4QX");
});
