import { planBreaks, type PlanSlot } from "./break-plan";
export type StoredBreakPlan = { user_id: string; label: string; kind: string; start_min: number | null };
/** Retry all-null plans when cover changes; real allocations remain fixed. */
export function pendingBreakAllocations(slots: readonly PlanSlot[], stored: readonly StoredBreakPlan[], nowMin: number): StoredBreakPlan[] {
  const fixed = new Set(stored.filter((row) => row.start_min !== null).map((row) => row.user_id));
  const reserved = stored.flatMap((row) => row.start_min === null ? [] : [{ start: row.start_min, end: row.start_min + (row.kind === "lunch" ? 30 : 15) }]);
  const result = planBreaks(slots, 1, undefined, reserved, fixed);
  return slots.filter((slot) => !fixed.has(slot.userId) && nowMin < slot.end).flatMap((slot) => {
    const plan = result.get(slot.userId);
    if (!plan) return [];
    return [plan.break1, plan.lunch, plan.break2].filter((item) => item.start !== null && item.start > nowMin).map((item) => ({
      user_id: slot.userId, label: item.label, kind: item.kind, start_min: item.start,
    }));
  });
}
