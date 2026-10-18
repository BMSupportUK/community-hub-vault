import { ukClock } from "./shift-finish";

/** Preparing applies only to a sign-in for a not-yet-started rota slot. */
export function isPreparingForShift(now: number, clockIn: string | null, slot: { shift_date: string; start_time: string; end_time: string } | null) {
  if (!clockIn || !slot) return false;
  const signedIn = ukClock(Date.parse(clockIn));
  const current = ukClock(now);
  const start = slot.start_time.padEnd(8, ":00");
  return signedIn.date === slot.shift_date && current.date === slot.shift_date &&
    signedIn.time < start && current.time < start;
}