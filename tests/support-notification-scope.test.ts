import { describe, expect, test } from "bun:test";
import { supportNotificationsEnabled } from "../src/lib/support-notification-scope";
import { isFanZonePath } from "../src/lib/fan-zone-nav";

describe("BM Support and Fan Zone notification separation", () => {
  test("BM Support staff get no support alerts while viewing Fan Zone", () => {
    for (const path of ["/forum", "/forum/general/topic", "/fan-zone", "/fanzone/messages", "/boro-fantasy"]) {
      expect(supportNotificationsEnabled(false, isFanZonePath(path))).toBe(false);
    }
  });
  test("Fan Zone-only accounts never get BM Support alerts", () => {
    expect(supportNotificationsEnabled(true, false)).toBe(false);
    expect(supportNotificationsEnabled(true, true)).toBe(false);
  });
  test("BM Support alerts remain enabled on the staff portal", () => {
    expect(supportNotificationsEnabled(false, isFanZonePath("/staff-portal"))).toBe(true);
  });
});