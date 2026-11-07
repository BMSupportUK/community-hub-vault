/** Multiplier the apps apply to their background check-in timers; clamped 1–10. */
export function checkinSlowdown(raw: unknown): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 1;
}
