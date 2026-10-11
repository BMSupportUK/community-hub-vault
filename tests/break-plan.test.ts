import { test, expect } from "bun:test";
import { planBreaks, toMinutes } from "../src/lib/break-plan";

const slot = (userId: string, a: string, b: string) => ({ userId, start: toMinutes(a), end: toMinutes(b) });

test("break 1 in first part, lunch around halfway, break 2 in second part", () => {
  const p = planBreaks([slot("a", "09:00", "17:00"), slot("b", "09:00", "17:00")]).get("a")!;
  expect(p.break1.start).toBe(toMinutes("11:00"));
  expect(p.lunch.start).toBe(toMinutes("13:00"));
  expect(p.break2.start).toBe(toMinutes("15:00"));
});

test("at least one person always stays working", () => {
  const plan = planBreaks([slot("a", "09:00", "17:00"), slot("b", "09:00", "17:00")]);
  const a = plan.get("a")!, b = plan.get("b")!;
  expect(b.lunch.start).not.toBe(a.lunch.start);
  expect(b.break1.start).not.toBe(a.break1.start);
});

test("with enough cover two people can be away together", () => {
  const plan = planBreaks([slot("a", "09:00", "17:00"), slot("b", "09:00", "17:00"), slot("c", "09:00", "17:00")]);
  expect(plan.get("b")!.lunch.start).toBe(plan.get("a")!.lunch.start);
});

test("someone alone on shift gets no slot", () => {
  expect(planBreaks([slot("a", "09:00", "17:00")]).get("a")!.lunch.start).toBeNull();
});
