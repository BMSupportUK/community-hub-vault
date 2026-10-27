// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { PIN_TTL_MS, PIN_MAX_TRIES, isPinFormat, makePin, pinUsable } from "./enabler-pin";

describe("enabler login PIN", () => {
  test("lasts 24 hours", () => { expect(PIN_TTL_MS).toBe(86_400_000); });
  test("existing PIN remains usable until the exact 24-hour boundary", () => {
    const start = Date.parse("2026-10-27T11:54:00Z");
    const row = { expires_at: "2026-10-28T11:54:00Z", revoked_at: null };
    expect(pinUsable(row, start + 86_399_999)).toBe(true);
    expect(pinUsable(row, start + 86_400_000)).toBe(false);
  });
  test("expired PIN rejected", () => {
    const now = Date.now();
    expect(pinUsable({ expires_at: new Date(now + 1000).toISOString(), revoked_at: null }, now)).toBe(true);
    expect(pinUsable({ expires_at: new Date(now - 1).toISOString(), revoked_at: null }, now)).toBe(false);
  });
  test("replaced PIN rejected", () => {
    expect(pinUsable({ expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: new Date().toISOString() })).toBe(false);
  });
  test("5 tries before lockout", () => { expect(PIN_MAX_TRIES).toBe(5); });
  test("PINs are six digits", () => {
    for (let i = 0; i < 50; i++) expect(isPinFormat(makePin())).toBe(true);
    expect(isPinFormat("12345")).toBe(false);
  });
});
