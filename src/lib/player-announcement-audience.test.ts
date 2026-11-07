// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { announcementReachesDevice } from "./player-announcement-audience";

const now = Date.parse("2026-11-07T15:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const sent = now - 30_000;
const dev = (over = {}) => ({ id: "d1", user_id: "u1", offsite_customer_id: null, connected_since: iso(now - 600_000), last_seen_at: iso(now - 5_000), ...over });
const everyone = { sent_at: sent, target_user_id: null, target_device_id: null };

describe("short announcements", () => {
  test("online device connected before sending gets it", () => expect(announcementReachesDevice(everyone, dev(), now)).toBe(true));
  test("offline linked device never gets it", () => expect(announcementReachesDevice(everyone, dev({ last_seen_at: iso(now - 3600_000) }), now)).toBe(false));
  test("device that connected after sending does not get it", () => expect(announcementReachesDevice(everyone, dev({ connected_since: iso(sent + 1000) }), now)).toBe(false));
  test("device message reaches only that device", () => {
    const a = { sent_at: sent, target_user_id: "u1", target_device_id: "d1" };
    expect(announcementReachesDevice(a, dev(), now)).toBe(true);
    expect(announcementReachesDevice(a, dev({ id: "d2" }), now)).toBe(false);
  });
});
