// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { watchActivityByDay } from "./player-watch-activity";

test("activity groups into the latest 7 UK days, older rows dropped", () => {
  const now = Date.parse("2026-11-05T08:00:00Z");
  const rows = [
    { id: "a", last_watched_at: "2026-11-05T07:00:00Z" },
    { id: "b", last_watched_at: "2026-11-04T23:30:00Z" },
    { id: "c", last_watched_at: "2026-10-29T12:00:00Z" },
    { id: "d", last_watched_at: "2026-10-30T12:00:00Z" },
  ];
  const days = watchActivityByDay(rows, now);
  expect(days.map(d => d.day)).toEqual(["2026-11-05", "2026-11-04", "2026-11-03", "2026-11-02", "2026-11-01", "2026-10-31", "2026-10-30"]);
  expect(days[0].rows.map(r => r.id)).toEqual(["a"]);
  expect(days[1].rows.map(r => r.id)).toEqual(["b"]);
  expect(days[6].rows.map(r => r.id)).toEqual(["d"]);
});
