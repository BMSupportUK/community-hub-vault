import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { shiftBreakdown, shiftHours } from "@/lib/shift-breakdown";
import type { BreakKind } from "@/lib/breaks";

interface Props {
  shift: { clock_in: string; clock_out: string | null };
  breaks: { kind: BreakKind; started_at: string; ended_at: string | null }[];
  away: { starts_at: string; ends_at: string | null }[];
}

export function ShiftBreakdownCard({ shift, breaks, away }: Props) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (shift.clock_out) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [shift.clock_out]);
  const result = shiftBreakdown(shift, breaks, away, now ?? Date.parse(shift.clock_out ?? shift.clock_in));
  const segments = [
    { name: "Working", value: result.workedMs, percent: result.workedPercent, color: "var(--success)" },
    { name: "Breaks", value: result.breakMs, percent: result.breakPercent, color: "var(--warning)" },
    { name: "Away", value: result.awayMs, percent: result.awayPercent, color: "var(--accent)" },
  ];
  return (
    <section aria-label="Shift time breakdown" className="min-w-0 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">Shift breakdown</h4>
        <span className="text-xs text-muted-foreground">{shift.clock_out ? "Full shift" : "Shift so far"} · {shiftHours(result.totalMs)}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
        <div className="size-32 shrink-0" role="img" aria-label={segments.map((s) => `${s.name} ${s.percent.toFixed(1)}%`).join(", ")}>
          {now !== null && result.totalMs > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={segments} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
                {segments.map((s) => <Cell key={s.name} fill={s.color} />)}
              </Pie></PieChart>
            </ResponsiveContainer>
          ) : <div className="size-32 rounded-full bg-muted" />}
        </div>
        <dl className="min-w-0 flex-1 space-y-3">
          {segments.map((s) => (
            <div key={s.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs">
              <dt className="flex items-center gap-2"><span className={`size-2.5 shrink-0 rounded-full ${s.name === "Working" ? "bg-success" : s.name === "Breaks" ? "bg-warning" : "bg-accent"}`} />{s.name}</dt>
              <dd className="text-right tabular-nums"><span className="font-semibold">{s.percent.toFixed(1)}%</span><span className="block text-muted-foreground">{shiftHours(s.value)}</span></dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">Actual worked</span>
        <strong className="text-xl tabular-nums text-success">{shiftHours(result.workedMs)}</strong>
      </div>
    </section>
  );
}