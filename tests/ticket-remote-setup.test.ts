import { test, expect } from "bun:test";
import { appChecksPassed, canRequestTicketScreenShare, REMOTE_SETUP_STEPS, stepDone } from "../src/lib/ticket-remote-setup";

test("staff cannot request screen share until the app confirms setup", () => {
  expect(canRequestTicketScreenShare(null)).toBe(false);
  expect(canRequestTicketScreenShare({ completed_at: null })).toBe(false);
  expect(canRequestTicketScreenShare({ completed_at: "2026-10-25T12:00:00Z" })).toBe(true);
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
