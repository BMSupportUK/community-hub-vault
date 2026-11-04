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
