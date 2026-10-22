import { describe, expect, test } from "bun:test";
import { canSeeTvRemoteHistory, canUseTvRemote, keyForKeyboard, normalizePairCode, pairCodeExpired, sessionIdle } from "../src/lib/tv-remote";

describe("TV remote rules", () => {
  test("pair code lasts 10 minutes", () => {
    const start = new Date("2026-10-22T12:00:00Z");
    expect(pairCodeExpired(start, new Date("2026-10-22T12:09:59Z"))).toBe(false);
    expect(pairCodeExpired(start, new Date("2026-10-22T12:10:00Z"))).toBe(true);
  });
  test("session ends after 30 idle minutes", () => {
    const last = new Date("2026-10-22T12:00:00Z");
    expect(sessionIdle(last, new Date("2026-10-22T12:29:00Z"))).toBe(false);
    expect(sessionIdle(last, new Date("2026-10-22T12:30:00Z"))).toBe(true);
  });
  test("only admin, management and staff can use the remote", () => {
    expect(canUseTvRemote(["staff"])).toBe(true);
    expect(canUseTvRemote(["management"])).toBe(true);
    expect(canUseTvRemote(["admin"])).toBe(true);
    expect(canUseTvRemote(["user"])).toBe(false);
    expect(canUseTvRemote(["moderator"])).toBe(false);
  });
  test("only admin and management see session history", () => {
    expect(canSeeTvRemoteHistory(["staff"])).toBe(false);
    expect(canSeeTvRemoteHistory(["management"])).toBe(true);
  });
  test("code input keeps six digits", () => {
    expect(normalizePairCode("12 34-567")).toBe("123456");
  });
  test("keyboard mapping", () => {
    expect(keyForKeyboard("Enter")).toBe("ok");
    expect(keyForKeyboard("Backspace")).toBe("back");
    expect(keyForKeyboard("Escape")).toBe("home");
    expect(keyForKeyboard("x")).toBe(null);
  });
});
