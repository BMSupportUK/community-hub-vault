import { expect, test } from "bun:test";
import { DANE_J_BREAK_USER_ID, planBreaks } from "../src/lib/break-plan";
import { pendingBreakAllocations } from "../src/lib/break-plan-allocation";

const solo = { userId: DANE_J_BREAK_USER_ID, start: 540, end: 1140 };

test("Dane J receives all three breaks on a solo 09:00–19:00 shift", () => {
  const plan = planBreaks([solo]).get(DANE_J_BREAK_USER_ID);
  expect(plan?.break1.start).toBe(690);
  expect(plan?.lunch.start).toBe(840);
  expect(plan?.break2.start).toBe(990);
});

test("other staff still need cover when working alone", () => {
  const plan = planBreaks([{ ...solo, userId: "other-staff" }]).get("other-staff");
  expect(plan?.break1.start).toBeNull();
  expect(plan?.lunch.start).toBeNull();
  expect(plan?.break2.start).toBeNull();
});

test("Dane's empty saved allocation retries even with no cover", () => {
  const stored = [
    { user_id: solo.userId, label: "Break 1", kind: "break", start_min: null },
    { user_id: solo.userId, label: "Main break", kind: "lunch", start_min: null },
    { user_id: solo.userId, label: "Break 2", kind: "break", start_min: null },
  ];
  expect(pendingBreakAllocations([solo], stored, 540).map((row) => row.start_min)).toEqual([690, 840, 990]);
});

test("Dane's existing allocated times are never moved by the solo exception", () => {
  expect(pendingBreakAllocations([solo], [
    { user_id: solo.userId, label: "Break 1", kind: "break", start_min: 705 },
    { user_id: solo.userId, label: "Main break", kind: "lunch", start_min: 870 },
    { user_id: solo.userId, label: "Break 2", kind: "break", start_min: 1005 },
  ], 540)).toEqual([]);
});