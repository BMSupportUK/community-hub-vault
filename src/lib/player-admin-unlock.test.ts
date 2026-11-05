// @ts-nocheck — tests run with bun test.
import { expect, test } from "bun:test";
import { PLAYER_ADMIN_UNLOCK_MS, isStillUnlocked } from "./player-admin-unlock";

test("BM Player admin stays unlocked for 10 minutes of no activity", () => {
  expect(PLAYER_ADMIN_UNLOCK_MS).toBe(10 * 60_000);
  const start = 1_000_000;
  expect(isStillUnlocked(start + PLAYER_ADMIN_UNLOCK_MS, start + 9 * 60_000)).toBe(true);
  expect(isStillUnlocked(start + PLAYER_ADMIN_UNLOCK_MS, start + 10 * 60_000)).toBe(false);
});
