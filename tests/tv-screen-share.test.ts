import { describe, expect, test } from "bun:test";
import { screenShareInProgress } from "../src/lib/tv-remote";

describe("repeat screen share requests", () => {
  test("an ended session allows another request immediately", () => {
    expect(screenShareInProgress("ended")).toBe(false);
    expect(screenShareInProgress(null)).toBe(false);
  });
  test("an expired session allows another request", () => {
    expect(screenShareInProgress("expired")).toBe(false);
  });
  test("a waiting or connected session remains in progress", () => {
    for (const status of ["pending", "claimed", "active"]) {
      expect(screenShareInProgress(status)).toBe(true);
    }
  });
});