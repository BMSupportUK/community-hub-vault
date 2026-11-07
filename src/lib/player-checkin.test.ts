import { expect, test } from "bun:test";
import { checkinSlowdown } from "./player-checkin";
test("slowdown defaults to 1 and clamps to 1..10", () => {
  expect(checkinSlowdown(null)).toBe(1);
  expect(checkinSlowdown(3)).toBe(3);
  expect(checkinSlowdown(50)).toBe(10);
  expect(checkinSlowdown(0)).toBe(1);
});
