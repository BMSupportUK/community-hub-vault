import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { breakCountdown, breakIcon, breakLabel, type BreakKind } from "@/lib/breaks";

/**
 * Live break chip for staff cards: the break name with its remaining allowance
 * counting down every second, turning red and showing "+mm:ss" once the
 * allowance has run out. Renders nothing when the person is not on a break.
 */
export function StaffBreakChip({
  kind,
  startedAt,
  className,
}: {
  kind: BreakKind;
  startedAt: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  // The chip ticks on its own so a whole directory of cards doesn't re-render
  // every second — only the chips that are actually counting.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { over, label } = breakCountdown(kind, startedAt, now);
  const Icon = breakIcon(kind);
  const left = Math.max(0, Math.floor(breakCountdown(kind, startedAt, now).remainingSec));
  const title = over
    ? `On ${breakLabel(kind).toLowerCase()} — over by ${label.slice(1)}`
    : `On ${breakLabel(kind).toLowerCase()} — ${Math.floor(left / 60)}m ${left % 60}s left`;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ring-1",
        over
          ? "bg-destructive/15 text-destructive ring-destructive/40"
          : "bg-amber-500/15 text-amber-400 ring-amber-500/40",
        className,
      )}
    >
      <Icon className="size-2.5 shrink-0" />
      <span className="whitespace-nowrap">
        {breakLabel(kind)} {label}
      </span>
    </span>
  );
}
