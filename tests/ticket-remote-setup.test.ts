import { test, expect } from "bun:test";
import { canRequestTicketScreenShare, manualStepsDone, REMOTE_SETUP_STEPS } from "../src/lib/ticket-remote-setup";

test("staff cannot request screen share until the app confirms setup", () => {
  expect(canRequestTicketScreenShare(null)).toBe(false);
  expect(canRequestTicketScreenShare({ completed_at: null })).toBe(false);
  expect(canRequestTicketScreenShare({ completed_at: "2026-10-25T12:00:00Z" })).toBe(true);
});

test("app code check only after every card is confirmed", () => {
  const manual = REMOTE_SETUP_STEPS.android.map((_, i) => i).filter((i) => !REMOTE_SETUP_STEPS.android[i]!.appCheck);
  expect(manualStepsDone("android", manual.slice(1))).toBe(false);
  expect(manualStepsDone("android", manual)).toBe(true);
});
