import { describe, expect, test } from "bun:test";
import { LINK_CODE_TTL_MS, linkCodeUsable, normaliseDns, parseReportSearch, reportLink, reportTicketText } from "../src/lib/player-link";

describe("BM Player link codes", () => {
  test("code lasts 10 minutes", () => {
    expect(LINK_CODE_TTL_MS).toBe(600_000);
  });
  test("expired code is refused", () => {
    expect(linkCodeUsable({ expires_at: new Date(1000).toISOString(), used_at: null }, 2000)).toBe(false);
  });
  test("used code is refused even before expiry", () => {
    expect(linkCodeUsable({ expires_at: new Date(10_000).toISOString(), used_at: new Date(500).toISOString() }, 1000)).toBe(false);
  });
  test("fresh unused code works", () => {
    expect(linkCodeUsable({ expires_at: new Date(10_000).toISOString(), used_at: null }, 1000)).toBe(true);
  });
});

describe("BM Player DNS", () => {
  test("keeps scheme, host and port", () => {
    expect(normaliseDns(" http://example.com:8080/ ")).toBe("http://example.com:8080");
  });
  test("rejects non-web addresses and paths", () => {
    expect(normaliseDns("ftp://example.com")).toBeNull();
    expect(normaliseDns("http://example.com/get.php?x=1")).toBeNull();
  });
});

describe("Report a problem", () => {
  test("live TV report pre-fills channel, category and device", () => {
    const p = parseReportSearch({ report: "live", title: "Sport 1 HD", cat: "Sports", device: "Fire TV" })!;
    const t = reportTicketText(p);
    expect(t.subject).toBe("Live TV problem – Sport 1 HD");
    expect(t.message).toContain("Channel: Sport 1 HD");
    expect(t.message).toContain("Device: Fire TV");
  });
  test("unknown report type is ignored", () => {
    expect(parseReportSearch({ report: "radio" })).toBeUndefined();
  });
  test("link opens the tickets page", () => {
    expect(reportLink("https://bmsupport.uk", { kind: "film", title: "Up" })).toBe("https://bmsupport.uk/tickets?report=film&title=Up");
  });
});
