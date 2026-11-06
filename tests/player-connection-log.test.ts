import { expect, test } from "bun:test";
import { logRange } from "../src/lib/player-connection-log";

const now = new Date(2026, 10, 6, 18, 0).getTime();

test("a month older than 30 days is clipped to the last 30 days", () => {
  const { from } = logRange({ year: 2026, month: 9, now });
  expect(from.getTime()).toBe(now - 30 * 86400000);
});

test("an exact date covers just that day", () => {
  const { from, to } = logRange({ year: 2026, month: 10, day: new Date(2026, 10, 3), now });
  expect(from.getTime()).toBe(new Date(2026, 10, 3).getTime());
  expect(to.getTime()).toBe(new Date(2026, 10, 4).getTime());
});
