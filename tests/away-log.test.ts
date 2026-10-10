import { test, expect } from "bun:test";
import { awayForShift, type AwayLogRow } from "../src/lib/staff-away";

const away = (id: string, starts_at: string, ends_at: string | null): AwayLogRow => ({
  id,
  reason: "Meeting",
  starts_at,
  ends_at,
});

const shift = { clock_in: "2026-10-10T09:00:00Z", clock_out: "2026-10-10T17:00:00Z" };

test("an away period inside the shift is logged against that shift", () => {
  const rows = [away("inside", "2026-10-10T10:00:00Z", "2026-10-10T10:15:00Z")];
  expect(awayForShift(rows, shift).map((r) => r.id)).toEqual(["inside"]);
});

test("an away period that started before the shift and ran into it is logged", () => {
  const rows = [away("straddling", "2026-10-10T08:30:00Z", "2026-10-10T09:20:00Z")];
  expect(awayForShift(rows, shift).map((r) => r.id)).toEqual(["straddling"]);
});

test("away periods wholly before or after the shift are not logged against it", () => {
  const rows = [
    away("before", "2026-10-10T08:00:00Z", "2026-10-10T08:30:00Z"),
    away("after", "2026-10-10T17:30:00Z", "2026-10-10T18:00:00Z"),
  ];
  expect(awayForShift(rows, shift)).toEqual([]);
});

test("an away period still running is logged against an open shift", () => {
  const rows = [away("open", new Date(Date.now() - 60_000).toISOString(), null)];
  expect(awayForShift(rows, { clock_in: new Date(Date.now() - 3_600_000).toISOString(), clock_out: null }).map((r) => r.id)).toEqual(["open"]);
});
