import { BREAK_LIMITS, type BreakKind } from "./breaks";

type Shift = { clock_in: string; clock_out: string | null };
type Break = { kind: BreakKind; started_at: string; ended_at: string | null };
type Away = { reason: string; starts_at: string; ends_at: string | null };
type Interval = [number, number];

/** Partition the clocked shift once: breaks take precedence over overlapping Away. */
export function shiftBreakdown(shift: Shift, breaks: readonly Break[], away: readonly Away[], now = Date.now()) {
  const start = Date.parse(shift.clock_in);
  const end = Math.min(now, shift.clock_out ? Date.parse(shift.clock_out) : now);
  const totalMs = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
  const clip = (from: number, to: number): Interval => [Math.max(start, from), Math.min(end, to)];
  const valid = ([from, to]: Interval) => Number.isFinite(from) && Number.isFinite(to) && to > from;
  const breakIntervals = breaks.map((b) => {
    const from = Date.parse(b.started_at);
    const to = b.ended_at ? Date.parse(b.ended_at) : Math.min(now, from + BREAK_LIMITS[b.kind] * 1000);
    return clip(from, to);
  }).filter(valid);
  const awayIntervals = away.map((a) => ({ reason: a.reason, span: clip(Date.parse(a.starts_at), a.ends_at ? Date.parse(a.ends_at) : now) })).filter((a) => valid(a.span));
  const points = [...new Set([start, end, ...breakIntervals.flat(), ...awayIntervals.flatMap((a) => a.span)])].sort((a, b) => a - b);
  let breakMs = 0;
  let awayMs = 0;
  const awayByReason = new Map<string, number>();
  if (totalMs > 0) {
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1];
      const to = points[i];
      if (from === undefined || to === undefined) continue;
      if (breakIntervals.some(([a, b]) => a <= from && b >= to)) breakMs += to - from;
      else {
        const hit = awayIntervals.find(({ span: [a, b] }) => a <= from && b >= to);
        if (hit) {
          awayMs += to - from;
          awayByReason.set(hit.reason, (awayByReason.get(hit.reason) ?? 0) + (to - from));
        }
      }
    }
  }
  const workedMs = Math.max(0, totalMs - breakMs - awayMs);
  const percentage = (ms: number) => totalMs ? ms / totalMs * 100 : 0;
  const awayReasons = [...awayByReason.entries()].map(([reason, ms]) => ({ reason, ms, percent: percentage(ms) })).sort((a, b) => b.ms - a.ms);
  return { totalMs, workedMs, breakMs, awayMs, awayReasons, workedPercent: percentage(workedMs), breakPercent: percentage(breakMs), awayPercent: percentage(awayMs) };
}

export function shiftHours(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}