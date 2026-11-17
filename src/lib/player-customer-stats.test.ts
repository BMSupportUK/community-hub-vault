// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { channelLinkRating } from "./player-customer-stats";
const snap = (o: Partial<Record<string, number>>) => ({ ping_ms: 40, stalls: 0, reconnects: 0, delivery_ratio: 1, short_ms: 0, poor_ms: 0, ...o }) as never;
describe("channel connection rating matches the box", () => {
  test("one reconnect is Fair", () => expect(channelLinkRating(snap({ reconnects: 1 }))).toBe("Fair"));
  test("two reconnects is Poor", () => expect(channelLinkRating(snap({ reconnects: 2 }))).toBe("Poor"));
  test("steady low ping is Excellent", () => expect(channelLinkRating(snap({}))).toBe("Excellent"));
});
