import { describe, expect, test } from "bun:test";
import { fotmobEventKey } from "../src/lib/fotmob-event-key";

describe("FotMob incident keys", () => {
  test("zero placeholders cannot merge a goal into a booking", () => {
    const booking = fotmobEventKey({ eventId: 0, reactKey: "011Card1136096undefinedtrue" }, "booking");
    const goal = fotmobEventKey({ eventId: 0, reactKey: "057Goal1417094undefinedtrue" }, "goal");
    expect(booking).toBe("011Card1136096undefinedtrue");
    expect(goal).toBe("057Goal1417094undefinedtrue");
    expect(goal).not.toBe(booking);
  });
  test("invalid IDs fall back to stable incident identity", () => {
    expect(fotmobEventKey({ eventId: "0", reactKey: "undefined61Substitution" }, "fotmob-sub-61-away-123-456")).toBe("fotmob-sub-61-away-123-456");
    expect(fotmobEventKey({ eventId: "" }, "incident")).toBe("incident");
  });
  test("real provider IDs remain stable across refreshes", () => {
    expect(fotmobEventKey({ eventId: 123, reactKey: "other" }, "fallback")).toBe("123");
    expect(fotmobEventKey({ eventId: 0, reactKey: "057Goal1417094undefinedtrue" }, "different-fallback")).toBe("057Goal1417094undefinedtrue");
  });
});