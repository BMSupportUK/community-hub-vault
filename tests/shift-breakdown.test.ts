import { test, expect } from "bun:test";
import { shiftBreakdown } from "../src/lib/shift-breakdown";

const shift = { clock_in: "2026-10-10T09:00:00Z", clock_out: "2026-10-10T17:00:00Z" };
const now = Date.parse("2026-10-10T18:00:00Z");
const hour = 3_600_000;

test("working excludes breaks and Away and all percentages use clocked shift hours", () => {
  const result = shiftBreakdown(shift, [
    { kind: "lunch", started_at: "2026-10-10T12:00:00Z", ended_at: "2026-10-10T12:30:00Z" },
    { kind: "break", started_at: "2026-10-10T10:00:00Z", ended_at: "2026-10-10T10:15:00Z" },
    { kind: "break", started_at: "2026-10-10T15:00:00Z", ended_at: "2026-10-10T15:15:00Z" },
  ], [{ starts_at: "2026-10-10T13:00:00Z", ends_at: "2026-10-10T14:00:00Z" }], now);
  expect(result).toEqual({ totalMs: 8 * hour, workedMs: 6 * hour, breakMs: hour, awayMs: hour, workedPercent: 75, breakPercent: 12.5, awayPercent: 12.5 });
});

test("overlaps are counted once and periods are clipped to the shift", () => {
  const result = shiftBreakdown(shift, [{ kind: "lunch", started_at: "2026-10-10T12:00:00Z", ended_at: "2026-10-10T12:30:00Z" }], [
    { starts_at: "2026-10-10T08:00:00Z", ends_at: "2026-10-10T10:00:00Z" },
    { starts_at: "2026-10-10T12:00:00Z", ends_at: "2026-10-10T13:00:00Z" },
    { starts_at: "2026-10-10T12:15:00Z", ends_at: "2026-10-10T13:00:00Z" },
    { starts_at: "2026-10-10T16:00:00Z", ends_at: null },
  ], now);
  expect(result.breakMs).toBe(0.5 * hour);
  expect(result.awayMs).toBe(2.5 * hour);
  expect(result.workedMs).toBe(5 * hour);
});

test("open breaks stop at the automatic 15-minute short and 30-minute lunch limits", () => {
  const result = shiftBreakdown(shift, [
    { kind: "break", started_at: "2026-10-10T10:00:00Z", ended_at: null },
    { kind: "lunch", started_at: "2026-10-10T12:00:00Z", ended_at: null },
  ], [], now);
  expect(result.breakMs).toBe(45 * 60_000);
});

test("active shifts and Away use the same live clock", () => {
  const active = { ...shift, clock_out: null };
  const away = [{ starts_at: "2026-10-10T10:00:00Z", ends_at: null }];
  const first = shiftBreakdown(active, [], away, Date.parse("2026-10-10T11:00:00Z"));
  const next = shiftBreakdown(active, [], away, Date.parse("2026-10-10T12:00:00Z"));
  expect(first.awayMs).toBe(hour);
  expect(next.awayMs).toBe(2 * hour);
  expect(next.workedMs).toBe(hour);
});

test("empty and invalid shift durations have zero percentages", () => {
  expect(shiftBreakdown({ clock_in: shift.clock_in, clock_out: shift.clock_in }, [], [], now).workedPercent).toBe(0);
  expect(shiftBreakdown({ clock_in: "invalid", clock_out: null }, [], [], now).totalMs).toBe(0);
});