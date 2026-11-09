import { describe, expect, test } from "bun:test";
import { totpAt, totpMatches, totpStillValid } from "../src/lib/player-totp";

const RFC = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // RFC 6238 SHA-1 test secret

describe("BM Player authenticator unlock", () => {
  test("matches the RFC 6238 code at 59 seconds", async () => {
    expect(await totpAt(RFC, 1)).toBe("287082");
  });
  test("accepts one step of clock drift but not two", async () => {
    expect(await totpMatches(RFC, "287082", 89_000)).toBe(true);
    expect(await totpMatches(RFC, "287082", 120_000)).toBe(false);
  });
  test("is asked again after one day", () => {
    const now = Date.parse("2026-11-09T20:00:00Z");
    expect(totpStillValid("2026-11-09T08:00:00Z", now)).toBe(true);
    expect(totpStillValid("2026-11-08T19:59:00Z", now)).toBe(false);
    expect(totpStillValid(null, now)).toBe(false);
  });
});
