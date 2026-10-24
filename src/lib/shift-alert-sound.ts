export const LATE_END_WARNING_MS = 2 * 60_000;

export function shiftAlertSoundEvent(
  slotId: string,
  stage: "start" | "end",
  target: number,
  now: number,
  promptVisible: boolean,
): { key: string; tone: string } | null {
  if (!Number.isFinite(target)) return null;
  const overdue = now >= target;
  // The end-time clip belongs to the visible question, not a hidden toast.
  if (stage === "end" && overdue && !promptVisible) return null;
  // A late "ending soon" warning (final 2 minutes) would clash with the
  // end-of-shift question's own clip, so skip it.
  if (stage === "end" && !overdue && target - now < LATE_END_WARNING_MS) return null;
  return {
    key: `${slotId}:${stage}:${overdue ? "over" : "warn"}`,
    tone: stage === "end" && overdue ? "shift_over" : `shift_${stage}`,
  };
}