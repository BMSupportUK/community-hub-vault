import { test, expect } from "bun:test";
import { planItems } from "@/components/app/BreakPlanRows";

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
