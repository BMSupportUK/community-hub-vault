import { useSyncExternalStore } from "react";
import { Clock, Play, StopCircle } from "lucide-react";

type ShiftNotice = { stage: "start" | "end"; overdue: boolean; countdown: string };
let notice: ShiftNotice | null = null;
const listeners = new Set<() => void>();
export function publishShiftHeaderNotice(next: ShiftNotice | null) {
  notice = next;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => notice;
const serverSnapshot = () => null;

/** Presentation only: shift lifecycle and audio remain owned by ShiftStartEndAlert. */
export function ShiftHeaderNotice() {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (!current) return null;
  const start = current.stage === "start";
  const Icon = start ? Play : StopCircle;
  const title = start
    ? current.overdue ? "Shift has started" : "Shift starting soon"
    : current.overdue ? "Shift has ended" : "Shift ending soon";
  return (
    <div role="status" aria-label={title} className={`flex w-44 shrink-0 items-center gap-2 border-r border-border pr-3 ${start ? "text-success" : "text-warning"}`}>
      <Icon className="size-4 shrink-0" />
      <div className="min-w-0 text-xs leading-tight">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 flex items-center gap-1 tabular-nums">
          {current.overdue ? start ? "Please clock in" : "Check your shift response" : <><Clock className="size-3" />{start ? "Starts" : "Ends"} in {current.countdown}</>}
        </p>
      </div>
    </div>
  );
}