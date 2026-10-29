// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { HANDOFF_TTL_MS, handoffUsable, makeHandoffCode, normalizeHandoffCode, ticketSupportHandoff, selfInstallHandoff } from "./enabler-handoff";

const now = Date.parse("2026-10-28T18:00:00Z");
const row = (o: Partial<{ user_id: string; expires_at: string; used_at: string | null }> = {}) =>
  ({ user_id: "u1", expires_at: new Date(now + HANDOFF_TTL_MS).toISOString(), used_at: null, ...o });

test("self-install code includes only selected apps and no support ticket", () => {
  expect(selfInstallHandoff("amazon", ["/api/public/tv-install-apk/selected-app"])).toEqual({
    purpose: "install", device: "amazon", helpPlan: 2,
    appPaths: ["/api/public/tv-install-apk/selected-app"], ticketId: null,
  });
});

test("remote-support tickets reuse the answered TV choice without requesting customer app installs", () => {
  for (const device of ["amazon", "android"] as const) {
    expect(ticketSupportHandoff("existing-ticket", device)).toEqual({
      purpose: "support", ticketId: "existing-ticket", device, helpPlan: 1, appPaths: [],
    });
  }
});

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

import { describe } from "bun:test";
const usable2 = handoffUsable;
describe("admin-issued codes", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  test("work only with the PIN issued alongside them", () => {
    const row = { user_id: "admin", expires_at: future, used_at: null, admin_issue_id: "i1" };
    expect(usable2(row, null, Date.now(), "i1")).toBe("ok");
    expect(usable2(row, null, Date.now(), "i2")).toBe("wrong_user");
    expect(usable2(row, "admin", Date.now(), null)).toBe("wrong_user");
  });
  test("an admin-issued PIN cannot redeem a customer's code", () => {
    expect(usable2({ user_id: "u1", expires_at: future, used_at: null }, null, Date.now(), "i1")).toBe("wrong_user");
  });
});
