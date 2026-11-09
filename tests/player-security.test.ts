import { describe, expect, test } from "bun:test";
import { appGenuine, BM_ANDROID_SIGNER, boxLimitReached, isQuietBox, lockoutMinutes, recentlySeen, unusualPlace } from "../src/lib/player-security";

const now = Date.parse("2026-11-09T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("player security", () => {
  test("three boxes per login, the fourth needs approval", () => {
    expect(boxLimitReached(2)).toBe(false);
    expect(boxLimitReached(3)).toBe(true);
  });
  test("lockouts step 15 minutes, 1 hour, 24 hours", () => {
    expect(lockoutMinutes(1)).toBe(15);
    expect(lockoutMinutes(2)).toBe(60);
    expect(lockoutMinutes(3)).toBe(1440);
    expect(lockoutMinutes(4)).toBe(1440);
  });
  test("boxes quiet for over 60 days are logged out", () => {
    expect(isQuietBox(ago(59 * 86_400_000), null, now)).toBe(false);
    expect(isQuietBox(ago(61 * 86_400_000), null, now)).toBe(true);
  });
  test("logins only go to boxes seen in the last 3 minutes", () => {
    expect(recentlySeen(ago(2 * 60_000), now)).toBe(true);
    expect(recentlySeen(ago(4 * 60_000), now)).toBe(false);
    expect(recentlySeen(null, now)).toBe(false);
  });
  test("only genuine Android apps get logins; old apps have until 23 Nov", () => {
    expect(appGenuine("android", BM_ANDROID_SIGNER, now)).toBe("ok");
    expect(appGenuine("firetv", "deadbeef", now)).toBe("fake");
    expect(appGenuine("android", "", now)).toBe("ok");
    expect(appGenuine("android", "", Date.parse("2026-11-24T00:00:00Z"))).toBe("update");
    expect(appGenuine("windows", "", Date.parse("2026-12-01T00:00:00Z"))).toBe("ok");
  });
  test("same login in another country within 30 minutes is flagged", () => {
    expect(unusualPlace("GB", [{ geo_country: "ES", last_seen_at: ago(10 * 60_000) }], now)).toBe("ES");
    expect(unusualPlace("GB", [{ geo_country: "ES", last_seen_at: ago(40 * 60_000) }], now)).toBe(null);
    expect(unusualPlace("GB", [{ geo_country: "GB", last_seen_at: ago(1000) }], now)).toBe(null);
  });
});

test("staff accounts are never held by the box limit", () => {
  expect(boxLimitReached(3, true)).toBe(false);
  expect(boxLimitReached(10, true)).toBe(false);
  expect(boxLimitReached(3, false)).toBe(true);
});
