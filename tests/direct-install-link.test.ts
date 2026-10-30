import { describe, expect, test } from "bun:test";
import { DIRECT_LINK_TTL_MS, directInstallUrl, directLinkUsable, makeDirectCode, normalizeDirectCode } from "@/lib/direct-install";

describe("BM Direct Install secure links", () => {
  test("links last 30 minutes", () => {
    expect(DIRECT_LINK_TTL_MS).toBe(30 * 60 * 1000);
  });
  test("an expired link no longer works", () => {
    const now = Date.parse("2026-10-30T22:00:00Z");
    expect(directLinkUsable({ expires_at: "2026-10-30T21:59:59Z" }, now)).toBe(false);
    expect(directLinkUsable({ expires_at: "2026-10-30T22:29:59Z" }, now)).toBe(true);
    expect(directLinkUsable(null, now)).toBe(false);
  });
  test("codes are 6 easy-to-type characters and validate", () => {
    const code = makeDirectCode();
    expect(code).toMatch(/^[a-z2-9]{6}$/);
    expect(normalizeDirectCode(code.toUpperCase())).toBe(code);
    expect(normalizeDirectCode("abc10o")).toBeNull();
    expect(normalizeDirectCode("abcd")).toBeNull();
  });
  test("successful installation makes the original download link unusable immediately", () => {
    const now = Date.parse("2026-10-30T23:12:00Z");
    const row = { expires_at: "2026-10-30T23:40:00Z", completed_at: null };
    expect(directLinkUsable(row, now)).toBe(true);
    expect(directLinkUsable({ ...row, completed_at: "2026-10-30T23:11:00Z" }, now)).toBe(false);
  });
  test("link is a short Downloader address", () => {
    expect(directInstallUrl("abc234")).toBe("https://bmsupport.uk/di/abc234");
  });
});
