import { describe, it, expect } from "vitest";
import { normalizeCoverReason, normalizeCoverUntil, coverUntilIsValid } from "@/lib/cover-request";
describe("cover sign-in requests", () => {
  it("requires a reason", () => { expect(normalizeCoverReason("   ")).toBeNull(); expect(normalizeCoverReason(" Covering Dan ")).toBe("Covering Dan"); });
  it("parses end time", () => { expect(normalizeCoverUntil("18:00")).toBe("18:00:00"); expect(normalizeCoverUntil("25:00")).toBeNull(); });
  it("end must be later today", () => { expect(coverUntilIsValid("18:00:00","14:10:00")).toBe(true); expect(coverUntilIsValid("13:00:00","14:10:00")).toBe(false); });
});
