import { describe, it, expect, vi } from "vitest";
import { normalizeCoverReason, normalizeCoverUntil, coverUntilIsValid, askCoverRequest } from "@/lib/cover-request";

// Works under both vitest and bun: swap window.prompt for a spy, then restore exactly what was there.
function withPrompt(prompt: () => string | null, run: () => void) {
  const had = "window" in globalThis;
  const previous = (globalThis as Record<string, unknown>).window;
  Object.defineProperty(globalThis, "window", { value: { prompt }, configurable: true, writable: true });
  try {
    run();
  } finally {
    if (had) Object.defineProperty(globalThis, "window", { value: previous, configurable: true, writable: true });
    else delete (globalThis as Record<string, unknown>).window;
  }
}

describe("cover sign-in requests", () => {
  it("requires a reason", () => { expect(normalizeCoverReason("   ")).toBeNull(); expect(normalizeCoverReason(" Covering Dan ")).toBe("Covering Dan"); });
  it("parses end time", () => { expect(normalizeCoverUntil("18:00")).toBe("18:00:00"); expect(normalizeCoverUntil("25:00")).toBeNull(); });
  it("server accepts the time the app already normalised", () => {
    expect(normalizeCoverUntil(normalizeCoverUntil("18:00"))).toBe("18:00:00");
  });
  it("end must be later today", () => { expect(coverUntilIsValid("18:00:00","14:10:00")).toBe(true); expect(coverUntilIsValid("13:00:00","14:10:00")).toBe(false); });
  it("staff get the business closing time pre-filled without being asked for a time", () => {
    const prompt = vi.fn().mockReturnValueOnce("Covering Dan");
    withPrompt(prompt, () => {
      const got = askCoverRequest("19:00");
      expect(got).toEqual({ reason: "Covering Dan", until: "19:00:00" });
      expect(prompt).toHaveBeenCalledTimes(1); // reason only, never the time
    });
  });
  it("moderators (no preset) are still asked for the end time", () => {
    const prompt = vi.fn().mockReturnValueOnce("Covering Dan").mockReturnValueOnce("21:30");
    withPrompt(prompt, () => {
      const got = askCoverRequest();
      expect(got).toEqual({ reason: "Covering Dan", until: "21:30:00" });
      expect(prompt).toHaveBeenCalledTimes(2);
    });
  });
});
