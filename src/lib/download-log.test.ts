// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { downloadSourceLabel, isWithinPeriod, logMonthLabel, logMonthOptions, logPeriod, logYearOptions, isNewDownload } from "./download-log";

describe("download log", () => {
  test("a plain GET is a new download", () => expect(isNewDownload("GET", null)).toBe(true));
  test("a range from byte 0 is a new download", () => expect(isNewDownload("GET", "bytes=0-")).toBe(true));
  test("a resumed range is not logged again", () => expect(isNewDownload("GET", "bytes=5000-")).toBe(false));
  test("HEAD probes are not downloads", () => expect(isNewDownload("HEAD", null)).toBe(false));
  test("Enabler installs on a TV get their own label", () => expect(downloadSourceLabel("tv_install")).toBe("Installed on TV by Enabler"));
});

describe("download log year and month tabs", () => {
  test("entries land in the UK year and month they belong to", () => {
    // Winter: UK time equals UTC, so this stays on 31 December.
    expect(logPeriod("2025-12-31T23:30:00Z")).toEqual({ year: "2025", month: "12" });
    // In summer the UK runs an hour ahead, so 23:30 UTC on 31 August is already September.
    expect(logPeriod("2026-08-31T23:30:00Z")).toEqual({ year: "2026", month: "9" });
  });
  test("year tabs list newest first", () =>
    expect(logYearOptions([{ createdAt: "2025-01-01T00:00:00Z" }, { createdAt: "2026-06-01T00:00:00Z" }])).toEqual(["2026", "2025"]));
  test("month tabs only include months that have entries", () =>
    expect(logMonthOptions([{ createdAt: "2026-01-15T00:00:00Z" }, { createdAt: "2026-03-02T00:00:00Z" }, { createdAt: "2025-03-02T00:00:00Z" }], "2026")).toEqual(["1", "3"]));
  test("month tabs are empty for a year with no entries", () =>
    expect(logMonthOptions([{ createdAt: "2026-01-15T00:00:00Z" }], "2024")).toEqual([]));
  test("a month label reads as the month name", () => expect(logMonthLabel("3")).toBe("Mar"));
  test("a row matches its own year and month", () => expect(isWithinPeriod("2026-03-02T00:00:00Z", "2026", "3")).toBe(true));
  test("a row is excluded from a different year", () => expect(isWithinPeriod("2026-03-02T00:00:00Z", "2025", "3")).toBe(false));
  test("all-years keeps every row", () => expect(isWithinPeriod("2026-03-02T00:00:00Z", "all", "all")).toBe(true));
});
