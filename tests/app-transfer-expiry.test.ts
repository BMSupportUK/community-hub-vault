import { describe, expect, test } from "bun:test";
import { TRANSFER_TTL_MS, isSafeToken, isTransferLive } from "@/src/lib/app-transfer";

describe("APK transfer link expiry", () => {
  test("transfers are issued for exactly 24 hours", () => {
    expect(TRANSFER_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  test("a token still inside its 24 hours is live", () => {
    const now = "2026-10-09T21:00:00.000Z";
    const expires = "2026-10-10T20:59:59.000Z";
    expect(isTransferLive(expires, now)).toBe(true);
  });

  test("a token expired even one second is dead", () => {
    const now = "2026-10-10T20:59:59.000Z";
    const expires = "2026-10-10T20:59:58.000Z";
    expect(isTransferLive(expires, now)).toBe(false);
  });

  test("a token is dead at the exact expiry moment", () => {
    const t = "2026-10-10T20:59:59.000Z";
    expect(isTransferLive(t, t)).toBe(false);
  });

  test("garbled expiry data never serves a download", () => {
    expect(isTransferLive("not-a-date", "2026-10-09T21:00:00.000Z")).toBe(false);
    expect(isTransferLive("", "2026-10-09T21:00:00.000Z")).toBe(false);
  });
});

describe("transfer token format", () => {
  test("7-digit download codes are accepted", () => {
    expect(isSafeToken("4839201")).toBe(true);
  });

  test("older 6-16 character alphanumeric codes are accepted", () => {
    expect(isSafeToken("AbC123")).toBe(true);
    expect(isSafeToken("A1b2C3d4E5f6G7h8")).toBe(true);
  });

  test("malformed tokens are rejected", () => {
    expect(isSafeToken("12345")).toBe(false);
    expect(isSafeToken("A1b2C3d4E5f6G7h8i")).toBe(false);
    expect(isSafeToken("483-9201")).toBe(false);
    expect(isSafeToken("")).toBe(false);
    expect(isSafeToken("<script>")).toBe(false);
  });
});
