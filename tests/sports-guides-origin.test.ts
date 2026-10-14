import { describe, it, expect } from "vitest";
import { sportsGuidesUseFanZone } from "@/lib/sports-guides-origin";

describe("sports guides chrome follows the side you came from", () => {
  it("dual-role member arriving from the Fan Zone gets Fan Zone chrome", () => {
    expect(sportsGuidesUseFanZone("/sports-guides", "fanzone", false)).toBe(true);
    expect(sportsGuidesUseFanZone("/sports-guides/read/abc", "fanzone", false)).toBe(true);
  });
  it("dual-role member arriving from BM Support keeps BM Support chrome", () => {
    expect(sportsGuidesUseFanZone("/sports-guides", "support", false)).toBe(false);
  });
  it("Fan-Zone-only member always gets Fan Zone chrome on the guides", () => {
    expect(sportsGuidesUseFanZone("/sports-guides", "support", true)).toBe(true);
  });
  it("other BM Support pages are unaffected", () => {
    expect(sportsGuidesUseFanZone("/tickets", "fanzone", false)).toBe(false);
  });
});
