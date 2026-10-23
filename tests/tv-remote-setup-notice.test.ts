import { describe, expect, test } from "bun:test";
import { remoteSetupNotice } from "../src/lib/tv-remote";

const base = { fire: true, installed: true, enabled: false, adb: true, helper: "1.8", error: null };

describe("staff remote setup message", () => {
  test("ready remote shows no message", () => {
    expect(remoteSetupNotice({ ...base, enabled: true })).toBe(null);
  });
  test("missing install is step 1", () => {
    expect(remoteSetupNotice({ ...base, installed: false })).toContain("Step 1");
  });
  test("Fire TV with ADB off is step 2", () => {
    expect(remoteSetupNotice({ ...base, adb: false })).toContain("Step 2");
  });
  test("Fire TV shows the TV's own error", () => {
    expect(remoteSetupNotice({ ...base, error: "Nobody pressed Allow" })).toContain("Nobody pressed Allow");
  });
  test("old helper without version is told to update", () => {
    expect(remoteSetupNotice({ fire: true, installed: true, enabled: false })).toContain("v2.1");
  });
});
