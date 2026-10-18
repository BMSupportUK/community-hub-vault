import { test, expect } from "bun:test";
import { planItems } from "../src/lib/break-plan-status";
import { ukMinutes } from "../src/lib/breaks";

const plan = {
  break1: { kind: "break", label: "Break 1", start: 720 },
  lunch: { kind: "lunch", label: "Main break", start: 840 },
  break2: { kind: "break", label: "Break 2", start: 960 },
} as never;

test("a break started at Break 2's time counts as Break 2, not Break 1", () => {
  const items = planItems(plan, ["break@960"], 976);
  expect(items[0].done).toBe(false);
  expect(items[2].done).toBe(true);
  expect(items[2].missed).toBe(false);
});

test("a break started at Break 1's time counts as Break 1", () => {
  const items = planItems(plan, ["break@725"], 800);
  expect(items[0].done).toBe(true);
  expect(items[2].done).toBe(false);
});

test("duplicate Break 1 entries cannot tick the 16:00 Break 2 at 15:22", () => {
  const items = planItems(plan, ["break@720", "break@735", "lunch@840"], 922);
  expect(items[0].done).toBe(true);
  expect(items[1].done).toBe(true);
  expect(items[2].done).toBe(false);
  expect(items[2].missed).toBe(false);
});

test("the auto-starter reads a summer break timestamp in UK time, not UTC", () => {
  const at = ukMinutes("2026-10-18T11:00:01.310648Z");
  expect(at).toBe(720);
  expect(planItems(plan, [`break@${at}`], 720)[0].done).toBe(true);
});

test("untimed break counts cannot mark the future 16:00 slot done at 15:22", () => {
  expect(planItems(plan, ["break", "break"], 922)[2].done).toBe(false);
});
