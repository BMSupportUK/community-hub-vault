import { test, expect } from "bun:test";
import { isAutomaticShiftOut, shiftEndSignOutAnswer, SHIFT_END_RESPONSE_MS } from "../src/lib/shift-end-history";

const base = { end_prompt_asked_at: "2026-10-12T18:00:00Z", still_working_ack_at: null, clock_out: null as string | null };

test("automatic shift sign-out uses the requested one-minute window", () => {
  expect(SHIFT_END_RESPONSE_MS).toBe(60_000);
  expect(isAutomaticShiftOut({ ...base, clock_out: "2026-10-12T18:01:00Z" })).toBe(true);
  expect(isAutomaticShiftOut({ ...base, clock_out: "2026-10-12T18:15:00Z" })).toBe(false);
});

test("a recorded Sign out answer is never automatic or missing", () => {
  const shift = { ...base, clock_out: "2026-10-12T18:01:00Z", end_prompt_signed_out_at: "2026-10-12T18:00:59Z" };
  expect(isAutomaticShiftOut(shift)).toBe(false);
  expect(shiftEndSignOutAnswer(shift)).toBe("2026-10-12T18:00:59Z");
});

test("the older seven-second Sign out answer is recognised in both histories", () => {
  const shift = { ...base, clock_out: "2026-10-12T18:00:07Z" };
  expect(isAutomaticShiftOut(shift)).toBe(false);
  expect(shiftEndSignOutAnswer(shift)).toBe("2026-10-12T18:00:07Z");
});

test("Still working prevents later clock-out being called automatic", () => {
  const shift = { ...base, still_working_ack_at: "2026-10-12T18:00:20Z", clock_out: "2026-10-12T18:01:00Z" };
  expect(isAutomaticShiftOut(shift)).toBe(false);
  expect(shiftEndSignOutAnswer(shift)).toBeNull();
});

test("unanswered automatic sign-outs and unrelated later exits are not inferred answers", () => {
  expect(shiftEndSignOutAnswer({ ...base, clock_out: "2026-10-12T18:01:00Z" })).toBeNull();
  expect(shiftEndSignOutAnswer({ ...base, clock_out: "2026-10-12T18:15:00Z" })).toBeNull();
  expect(shiftEndSignOutAnswer(base)).toBeNull();
});