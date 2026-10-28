// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { HANDOFF_TTL_MS, handoffUsable, makeHandoffCode, normalizeHandoffCode } from "./enabler-handoff";

const now = Date.parse("2026-10-28T18:00:00Z");
const row = (o: Partial<{ user_id: string; expires_at: string; used_at: string | null }> = {}) =>
  ({ user_id: "u1", expires_at: new Date(now + HANDOFF_TTL_MS).toISOString(), used_at: null, ...o });

test("code lasts 2 hours", () => {
  expect(HANDOFF_TTL_MS).toBe(7_200_000);
  expect(handoffUsable(row(), "u1", now + HANDOFF_TTL_MS - 1)).toBe("ok");
  expect(handoffUsable(row(), "u1", now + HANDOFF_TTL_MS)).toBe("expired");
});

test("code can only be used once", () => {
  expect(handoffUsable(row({ used_at: new Date(now).toISOString() }), "u1", now)).toBe("used");
});

test("code only works with the owner's PIN", () => {
  expect(handoffUsable(row(), "someone-else", now)).toBe("wrong_user");
  expect(handoffUsable(row(), null, now)).toBe("wrong_user");
});

test("codes are 6 digits", () => {
  for (let i = 0; i < 50; i++) expect(makeHandoffCode()).toMatch(/^\d{6}$/);
  expect(normalizeHandoffCode("123-456")).toBe("123456");
  expect(normalizeHandoffCode("12345")).toBeNull();
});
