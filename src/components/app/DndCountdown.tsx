import { useEffect, useState } from "react";
import { Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDndStatus } from "@/hooks/use-dnd";

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

/**
 * Live "DND • Xh Ym" countdown pill. Renders nothing when the user is not in
 * DND or when their DND has no end time (use DndBadge for the open-ended case).
 */
export function DndCountdown({
  userId,
  className,
  compact = false,
}: {
  userId: string | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  const info = useDndStatus(userId);
  const endsAtTime = info?.endsAt?.getTime();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!info?.active || !info.endsAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [info?.active, info?.endsAt, endsAtTime]);

  if (!info?.active) return null;

  const remaining = info.endsAt ? info.endsAt.getTime() - Date.now() : null;
  if (remaining !== null && remaining <= 0) return null;

  const endsLabel = info.endsAt
    ? `until ${info.endsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "";
  const title = info.note
    ? `Do Not Disturb — ${info.note}${endsLabel ? ` (${endsLabel})` : ""}`
    : `Do Not Disturb${endsLabel ? ` ${endsLabel}` : ""}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/40 font-semibold tabular-nums",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        className,
      )}
      title={title}
    >
      <Moon className={compact ? "size-2.5" : "size-3"} />
      <span>DND{remaining !== null ? ` • ${formatRemaining(remaining)}` : ""}</span>
    </span>
  );
}
