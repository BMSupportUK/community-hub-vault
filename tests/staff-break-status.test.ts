import { test, expect } from "bun:test";
import { breakCountdown } from "../src/lib/breaks";
import { DEMO_STAFF, demoShiftStatus } from "../src/lib/demo-data";

const zero = new Date(0).toISOString();

test("a break counts down its 15 minute allowance", () => {
  expect(breakCountdown("break", zero, 4 * 60_000)).toMatchObject({ over: false, label: "11:00" });
});

test("the main break counts down 30 minutes", () => {
  expect(breakCountdown("lunch", zero, 12 * 60_000)).toMatchObject({ over: false, label: "18:00" });
});

test("a break past its allowance is flagged as over with the overrun", () => {
  expect(breakCountdown("break", zero, 16 * 60_000)).toMatchObject({ over: true, label: "+01:00" });
  expect(breakCountdown("lunch", zero, 31 * 60_000)).toMatchObject({ over: true, label: "+01:00" });
});

test("the demo staff directory shows a main break and a break over its allowance", () => {
  const ids = DEMO_STAFF.map((s) => s.id);
  const { breaks } = demoShiftStatus(ids);
  const now = Date.now();
  const lunch = breaks.find((b) => b.kind === "lunch");
  const overBreak = breaks.find((b) => b.kind === "break");
  expect(lunch).toBeTruthy();
  expect(overBreak).toBeTruthy();
  expect(breakCountdown("lunch", lunch!.started_at, now).over).toBe(false);
  expect(breakCountdown("break", overBreak!.started_at, now).over).toBe(true);
});

test("the demo staff directory hides break rows for people it isn't showing", () => {
  expect(demoShiftStatus([]).breaks).toEqual([]);
});
