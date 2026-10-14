import { describe, expect, it } from "vitest";
import { shouldLockScreen } from "../src/lib/screen-lock-hash";

describe("screen lock on app return", () => {
  const now = 1_800_000;

  it("keeps a short return unlocked", () => {
    expect(shouldLockScreen(true, false, now - 30_000, 10, now)).toBe(false);
  });

  it("locks at the ten-minute staff inactivity boundary", () => {
    expect(shouldLockScreen(true, false, now - 599_999, 10, now)).toBe(false);
    expect(shouldLockScreen(true, false, now - 600_000, 10, now)).toBe(true);
  });

  it("honours a saved lock even with recent activity", () => {
    expect(shouldLockScreen(true, true, now - 1, 10, now)).toBe(true);
  });

  it("does not lock when the lock setting is disabled", () => {
    expect(shouldLockScreen(false, true, now - 600_000, 10, now)).toBe(false);
  });
});