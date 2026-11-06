import { describe, expect, test } from "bun:test";
import { bufferDateRange } from "./player-buffer-date";

describe("Buffering calendar filters", () => {
  test("a year covers that entire year", () => {
    expect(bufferDateRange({ year: 2026 })).toEqual({ _from: "2026-01-01", _to: "2027-01-01" });
  });
  test("a month covers only that month", () => {
    expect(bufferDateRange({ year: 2026, month: 11 })).toEqual({ _from: "2026-11-01", _to: "2026-12-01" });
  });
  test("an exact date covers only that day", () => {
    expect(bufferDateRange({ year: 2026, month: 11, day: 5 })).toEqual({ _from: "2026-11-05", _to: "2026-11-06" });
  });
  test("last day of a leap month ends at next month", () => {
    expect(bufferDateRange({ year: 2024, month: 2, day: 29 })).toEqual({ _from: "2024-02-29", _to: "2024-03-01" });
  });
});