import { describe, expect, test } from "bun:test";
import { newBackupCodes, normalizeBackupCode } from "../src/lib/player-backup-codes";

describe("BM Player backup codes", () => {
  test("ten unique codes are made", () => {
    const c = newBackupCodes();
    expect(c.length).toBe(10);
    expect(new Set(c).size).toBe(10);
    for (const x of c) expect(x).toMatch(/^\d{4}-\d{4}$/);
  });
  test("codes can be typed with or without the dash", () => {
    expect(normalizeBackupCode("1234-5678")).toBe("12345678");
    expect(normalizeBackupCode("12345678")).toBe("12345678");
    expect(normalizeBackupCode("123456")).toBeNull();
    expect(normalizeBackupCode("1234")).toBeNull();
  });
});
