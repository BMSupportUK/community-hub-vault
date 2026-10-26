import { expect, test } from "bun:test";
import { checksFresh } from "../src/lib/ticket-remote-setup";
const ok = { adb: true, helper: true, control: true, accessibility: true };
const now = Date.parse("2026-10-26T12:00:00Z");
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
test("check older than 24 hours is not fresh", () => { expect(checksFresh({ app_checks: ok, app_checked_at: iso(1441) }, now)).toBe(false); });
test("check 23 hours old is still fresh", () => { expect(checksFresh({ app_checks: ok, app_checked_at: iso(1380) }, now)).toBe(true); });
test("check already used for a share is not fresh", () => { expect(checksFresh({ app_checks: ok, app_checked_at: iso(30), checks_used_at: iso(10) }, now)).toBe(false); });
test("new check after a share is fresh again", () => { expect(checksFresh({ app_checks: ok, app_checked_at: iso(5), checks_used_at: iso(40) }, now)).toBe(true); });
test("failed checks are never fresh", () => { expect(checksFresh({ app_checks: { adb: true }, app_checked_at: iso(1) }, now)).toBe(false); });
import { remoteSetupProgress } from "../src/lib/ticket-remote-setup";
test("used check shows as waiting for a fresh check, not confirmed", () => {
  const p = remoteSetupProgress({ app_checks: ok, app_checked_at: iso(30), completed_at: iso(10), checks_used_at: iso(10) }, now);
  expect(p.stage).toBe(0);
});
test("fresh check shows as confirmed", () => {
  expect(remoteSetupProgress({ app_checks: ok, app_checked_at: iso(5), completed_at: null }, now).stage).toBe(4);
});
