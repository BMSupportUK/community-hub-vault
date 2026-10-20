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
  return {
    key: `${slotId}:${stage}:${overdue ? "over" : "warn"}`,
    tone: stage === "end" && overdue ? "shift_over" : `shift_${stage}`,
  };
}