import { test, expect } from "bun:test";
import { confirmCodeState, makeConfirmCode, normalizeConfirmCode, CONFIRM_TTL_MS } from "../src/lib/enabler-confirm-code";

const now = new Date("2026-10-26T12:00:00Z");
const row = (o: Partial<{ device: string; expires_at: string; used_at: string | null }> = {}) =>
  ({ device: "android", expires_at: new Date(now.getTime() + CONFIRM_TTL_MS).toISOString(), used_at: null, ...o });

test("code lasts 2 hours", () => {
  expect(CONFIRM_TTL_MS).toBe(2 * 60 * 60 * 1000);
  expect(confirmCodeState(row({ expires_at: new Date(now.getTime() - 1).toISOString() }), "android", now)).toBe("invalid");
  expect(confirmCodeState(row(), "android", now)).toBe("ok");
});
test("code remains usable after first submission for the full two hours", () => {
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
