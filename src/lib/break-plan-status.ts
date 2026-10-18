import type { UserPlan } from "./break-plan";

/** usedKinds entries may be "break" or "break@<UK minutes>" (when the break was started). */
export function planItems(plan: UserPlan | null, usedKinds: readonly string[], nowMin: number) {
  if (!plan) return [];
  const breakEntries = usedKinds.filter((k) => k === "break" || k.startsWith("break@"));
  const lunchUsed = usedKinds.some((k) => k === "lunch" || k.startsWith("lunch@"));
  let b1 = false;
  let b2 = false;
  for (const e of breakEntries) {
    const at = e.includes("@") ? Number(e.split("@")[1]) : NaN;
    const s1 = plan.break1.start;
    const s2 = plan.break2.start;
    // Timestamped records belong to one allocated slot only. A duplicate
    // Break 1 must never spill over into the future Break 2 allowance.
    if (Number.isFinite(at)) {
      const prefer2 = s2 !== null && at >= s2 && (s1 === null || Math.abs(at - s2) < Math.abs(at - s1));
      if (prefer2) b2 = true;
      else if (s1 !== null && at >= s1) b1 = true;
    } else if (!b1) b1 = true;
    else if (s2 !== null && nowMin >= s2) b2 = true;
  }
  return [
    { ...plan.break1, done: b1 },
    { ...plan.lunch, done: lunchUsed },
    { ...plan.break2, done: b2 },
  ].map((it) => ({ ...it, missed: !it.done && it.start !== null && nowMin > it.start + 15 }));
}

