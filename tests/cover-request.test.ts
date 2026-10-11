import { describe, it, expect, vi } from "vitest";
import { normalizeCoverReason, normalizeCoverUntil, coverUntilIsValid, askCoverRequest } from "@/lib/cover-request";
describe("cover sign-in requests", () => {
  it("requires a reason", () => { expect(normalizeCoverReason("   ")).toBeNull(); expect(normalizeCoverReason(" Covering Dan ")).toBe("Covering Dan"); });
  it("parses end time", () => { expect(normalizeCoverUntil("18:00")).toBe("18:00:00"); expect(normalizeCoverUntil("25:00")).toBeNull(); });
  it("end must be later today", () => { expect(coverUntilIsValid("18:00:00","14:10:00")).toBe(true); expect(coverUntilIsValid("13:00:00","14:10:00")).toBe(false); });
  it("staff get the business closing time pre-filled without being asked for a time", () => {
    const prompt = vi.fn().mockReturnValueOnce("Covering Dan");
    vi.stubGlobal("window", { prompt });
    const got = askCoverRequest("19:00");
    expect(got).toEqual({ reason: "Covering Dan", until: "19:00:00" });
    expect(prompt).toHaveBeenCalledTimes(1); // reason only, never the time
    vi.unstubAllGlobals();
  });
  it("moderators (no preset) are still asked for the end time", () => {
    const prompt = vi.fn().mockReturnValueOnce("Covering Dan").mockReturnValueOnce("21:30");
    vi.stubGlobal("window", { prompt });
    const got = askCoverRequest();
    expect(got).toEqual({ reason: "Covering Dan", until: "21:30:00" });
    expect(prompt).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
