import { test, expect } from "bun:test";
import { channelLinkRating } from "../src/lib/player-customer-stats";
const stable = { level: "strong", bars: 4, label: "" } as const;
test("38 ms stable is Excellent", () => expect(channelLinkRating(38, stable)).toBe("Excellent"));
test("150 ms is Good", () => expect(channelLinkRating(150, stable)).toBe("Good"));
test("300 ms is Fair", () => expect(channelLinkRating(300, stable)).toBe("Fair"));
test("poor playback is Poor even on low ping", () => expect(channelLinkRating(30, { level: "very_weak", bars: 1, label: "" })).toBe("Poor"));
test("no ping gives no rating", () => expect(channelLinkRating(null, stable)).toBeNull());
