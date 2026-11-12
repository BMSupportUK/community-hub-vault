// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { BufferBatch, eventTime, shouldAlert, MAX_CLOCK_SKEW_MS } from "./player-buffering";

describe("player buffering", () => {
  test("staff alert needs 5 different devices on one channel", () => {
    expect(shouldAlert(4)).toBe(false);
    expect(shouldAlert(5)).toBe(true);
  });
  test("batches are capped at 20 events", () => {
    const e = { kind: "live", content_id: "1", name: "Sky Sports", stall_ms: 2000, reconnected: false, at: 1 };
    expect(BufferBatch.safeParse(Array(20).fill(e)).success).toBe(true);
    expect(BufferBatch.safeParse(Array(21).fill(e)).success).toBe(false);
  });
  test("far-off device clocks fall back to server time", () => {
    const now = 1_000_000_000_000;
    expect(eventTime(now - 5000, now)).toBe(now - 5000);
    expect(eventTime(now - MAX_CLOCK_SKEW_MS - 1, now)).toBe(now);
    expect(eventTime(now + 60_000, now)).toBe(now);
  });
});

import { FeedSwitchBatch as __FSB, dedupeSwitches as __dd } from "./player-buffering";
test("feed switch batch caps at 50 and rejects unknown types", () => {
  const one = { type: "sound", content_id: "1", name: "BBC One", at: 1 };
  expect(__FSB.safeParse(Array(50).fill(one)).success).toBe(true);
  expect(__FSB.safeParse(Array(51).fill(one)).success).toBe(false);
  expect(__FSB.safeParse([{ ...one, type: "colour" }]).success).toBe(false);
});
test("same channel and type counted once per 30 seconds", () => {
  const s = (type: string, at: number) => ({ type, content_id: "1", name: "X", at });
  expect(__dd([s("picture", 0), s("picture", 29_999), s("picture", 30_000), s("sound", 1)]).length).toBe(3);
});
