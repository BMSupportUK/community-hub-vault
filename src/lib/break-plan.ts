/** Automatic break planning: Break 1 early, Lunch mid-shift, Break 2 late, keeping at least `minCover` people working. */
export type PlanSlot = { userId: string; start: number; end: number }; // minutes since midnight (UK)
export type PlanItem = { kind: "break" | "lunch"; label: string; start: number | null };
export type UserPlan = { break1: PlanItem; lunch: PlanItem; break2: PlanItem };

const STEP = 15;
const DUR = { break: 15, lunch: 30 } as const;

/** When `nowMin` is given, breaks are only planned into the rest of today: past slots are re-spread over [nowMin, shift end]. */
export function planBreaks(slots: readonly PlanSlot[], minCover = 1, nowMin?: number, reserved: readonly { start: number; end: number }[] = []): Map<string, UserPlan> {
  const taken: { start: number; end: number }[] = [...reserved];
  const result = new Map<string, UserPlan>();
  const onShift = (from: number, to: number) => slots.filter((s) => s.start <= from && s.end >= to).length;
  const awayAt = (from: number, to: number) => taken.filter((t) => t.start < to && t.end > from).length;
  const ordered = [...slots].sort((a, b) => a.start - b.start || a.userId.localeCompare(b.userId));

  const pick = (s: PlanSlot, target: number, dur: number, min: number, max: number): number | null => {
    const base = Math.round(target / STEP) * STEP;
    for (let k = 0; k <= (s.end - s.start) / STEP; k++) {
      for (const cand of k === 0 ? [base] : [base + k * STEP, base - k * STEP]) {
        if (cand < min || cand + dur > max) continue;
        // Everyone on shift in this window, minus those already away, minus this person, must leave minCover.
        if (onShift(cand, cand + dur) - awayAt(cand, cand + dur) - 1 >= minCover) return cand;
      }
    }
    return null;
  };

  for (const s of ordered) {
    const start = nowMin === undefined ? s.start : Math.max(s.start, Math.ceil(nowMin / STEP) * STEP);
    if (start >= s.end - DUR.break) {
      result.set(s.userId, {
        break1: { kind: "break", label: "Break 1", start: null },
        lunch: { kind: "lunch", label: "Lunch", start: null },
        break2: { kind: "break", label: "Break 2", start: null },
      });
      continue;
    }
    const eff = { ...s, start };
    const len = eff.end - eff.start;
    const reserve = (start: number | null, dur: number) => { if (start !== null) taken.push({ start, end: start + dur }); return start; };
    const lunch = reserve(pick(eff, eff.start + len / 2, DUR.lunch, eff.start, eff.end - 15), DUR.lunch);
    const mid = lunch ?? eff.start + len / 2;
    const b1 = reserve(pick(eff, eff.start + len / 4, DUR.break, eff.start, mid - DUR.break), DUR.break);
    const b2 = reserve(pick(eff, eff.start + (3 * len) / 4, DUR.break, mid + DUR.lunch, eff.end), DUR.break);
    result.set(s.userId, {
      break1: { kind: "break", label: "Break 1", start: b1 },
      lunch: { kind: "lunch", label: "Lunch", start: lunch },
      break2: { kind: "break", label: "Break 2", start: b2 },
    });
  }
  return result;
}

export const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };
export const fromMinutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
