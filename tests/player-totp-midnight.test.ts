import { describe, expect, test } from "bun:test";
import { totpStillValid } from "../src/lib/player-totp";

describe("BM Player 2FA resets at UK midnight", () => {
  test("23:59 code is not valid at 00:01", () =>
    expect(totpStillValid("2026-11-09T23:59:00Z", Date.parse("2026-11-10T00:01:00Z"))).toBe(false));
  test("00:01 code is still valid at 23:59", () =>
    expect(totpStillValid("2026-11-10T00:01:00Z", Date.parse("2026-11-10T23:59:00Z"))).toBe(true));
  test("summer time: 23:30 UTC is already the next UK day", () =>
    expect(totpStillValid("2026-07-01T22:30:00Z", Date.parse("2026-07-01T23:30:00Z"))).toBe(false));
});
