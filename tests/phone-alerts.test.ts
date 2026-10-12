import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { PHONE_ALERTS, phoneAlertFor } from "../src/lib/phone-alerts";

test("every phone alert has a unique tone and channel", () => {
  expect(new Set(PHONE_ALERTS.map((a) => a.tone)).size).toBe(PHONE_ALERTS.length);
  expect(new Set(PHONE_ALERTS.map((a) => a.channel)).size).toBe(PHONE_ALERTS.length);
});

test("every tone file is bundled in the Android app", () => {
  for (const a of PHONE_ALERTS) expect(existsSync(`android/app/src/main/res/raw/${a.tone}.mp3`)).toBe(true);
});

test("cover approved no longer shares the shift start tone", () => {
  expect(phoneAlertFor("shift_start_cover_approved")?.key).toBe("cover_approved");
  expect(phoneAlertFor("incident", "resolved")?.key).toBe("outage_resolved");
});

import { phoneAlertRoles, PHONE_ALERTS as ALL } from "../src/lib/phone-alerts";
test("management-only alerts go to admin + management; staff alerts include staff and moderators", () => {
  const get = (k: string) => phoneAlertRoles(ALL.find((a) => a.key === k)!);
  expect(get("early_finish")).toEqual(["admin", "management"]);
  expect(get("cover_request")).toEqual(["admin", "management"]);
  expect(get("ticket_assigned")).toEqual(["admin", "management", "staff", "moderator"]);
});
