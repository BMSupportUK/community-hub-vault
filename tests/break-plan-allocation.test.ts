import { test, expect } from "bun:test";
import { pendingBreakAllocations, type StoredBreakPlan } from "../src/lib/break-plan-allocation";
const slots = [{ userId: "dane", start: 540, end: 1140 }, { userId: "norman", start: 540, end: 1140 }];
const empty: StoredBreakPlan[] = [
  { user_id: "dane", label: "Break 1", kind: "break", start_min: null },
  { user_id: "dane", label: "Main break", kind: "lunch", start_min: null },
  { user_id: "dane", label: "Break 2", kind: "break", start_min: null },
];
const fixed: StoredBreakPlan[] = [
  { user_id: "norman", label: "Break 1", kind: "break", start_min: 690 },
  { user_id: "norman", label: "Main break", kind: "lunch", start_min: 840 },
  { user_id: "norman", label: "Break 2", kind: "break", start_min: 990 },
];
test("Dane's empty plan retries without moving Norman's breaks", () => {
  expect(pendingBreakAllocations(slots, [...empty, ...fixed], 537)).toEqual([
    { user_id: "dane", label: "Break 1", kind: "break", start_min: 705 },
    { user_id: "dane", label: "Main break", kind: "lunch", start_min: 870 },
    { user_id: "dane", label: "Break 2", kind: "break", start_min: 1005 },
  ]);
});
test("no cover does not persist new empty allocations", () => {
  expect(pendingBreakAllocations(slots.slice(0, 1), empty, 537)).toEqual([]);
});
test("real allocations never get re-spread", () => {
  expect(pendingBreakAllocations(slots, [...fixed.map((r) => ({ ...r, user_id: "dane" })), ...fixed], 537)).toEqual([]);
});
test("retry excludes past breaks and ended shifts", () => {
  expect(pendingBreakAllocations(slots, [...empty, ...fixed], 900).map((r) => r.start_min)).toEqual([1005]);
  expect(pendingBreakAllocations(slots, [...empty, ...fixed], 1140)).toEqual([]);
});
