import { test, expect } from "bun:test";
import { appChecksPassed, canRequestTicketScreenShare, REMOTE_SETUP_STEPS, stepDone, remoteSetupProgress, staffRemoteSetupReady, connectionReady } from "../src/lib/ticket-remote-setup";

test("staff cannot request screen share until the app confirms setup", () => {
  expect(canRequestTicketScreenShare(null)).toBe(false);
  expect(canRequestTicketScreenShare({ completed_at: null })).toBe(false);
  expect(canRequestTicketScreenShare({ completed_at: "2026-10-25T12:00:00Z" })).toBe(true);
});

test("staff ready tick remains complete when starting screen sharing consumes the TV check", () => {
  const row = {
    app_checks: { adb: true, helper: true, accessibility: true },
    app_checked_at: "2026-10-27T20:46:55.786Z",
    checks_used_at: "2026-10-27T20:48:05.824Z",
    completed_at: "2026-10-27T20:48:05.824Z",
    pending_session_id: null,
  };
  const now = Date.parse("2026-10-27T20:49:00Z");
  expect(staffRemoteSetupReady(row, now)).toBe(true);
  expect(connectionReady(row, now)).toBe(false);
  expect(staffRemoteSetupReady({ ...row, completed_at: null }, now)).toBe(false);
});

test("no step is done without an app report", () => {
  const empty = { app_checks: {}, app_checked_at: null, completed_at: null };
  for (const d of ["amazon", "android"] as const) for (const s of REMOTE_SETUP_STEPS[d]) expect(stepDone(s, empty)).toBe(false);
});

test("Helper code only unlocks after ADB, Helper and Accessibility are reported", () => {
  expect(appChecksPassed({ adb: true, helper: true, accessibility: false })).toBe(false);
  expect(appChecksPassed({ adb: true, helper: false, accessibility: true })).toBe(false);
  expect(appChecksPassed({ adb: true, helper: true, accessibility: true })).toBe(true);
});

test("Android / Google TV uses the same app checks as Amazon before the Helper code", () => {
  expect(appChecksPassed(null, "android")).toBe(false);
  expect(appChecksPassed(null, "amazon")).toBe(false);
  expect(appChecksPassed({ adb: true, helper: true, accessibility: true }, "android")).toBe(true);
});

test("setup progress follows the latest measured TV stages, not previous completion", () => {
  const row = { app_checked_at: new Date().toISOString(), completed_at: null };
  expect(remoteSetupProgress({ ...row, app_checks: null }).stage).toBe(0);
  expect(remoteSetupProgress({ ...row, app_checks: { adb: true } }).stage).toBe(1);
  expect(remoteSetupProgress({ ...row, app_checks: { adb: true, helper: true } }).stage).toBe(2);
  expect(remoteSetupProgress({ ...row, app_checks: { adb: true, helper: true, control: true } }).stage).toBe(3);
  expect(remoteSetupProgress({ ...row, app_checks: { adb: true, helper: true, control: true, accessibility: true } }).stage).toBe(4);
  expect(remoteSetupProgress({ ...row, completed_at: row.app_checked_at, app_checks: { adb: false } }).stage).toBe(0);
});
