import { useEffect, useState } from "react";
import { Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDndStatus } from "@/hooks/use-dnd";

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (d > 0) return `${d}d ${h}h ${pad(m)}m ${pad(s)}s`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0) return `${m}m ${pad(s)}s`;
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
  const endsAtTime = info?.endsAt?.getTime() ?? null;
  const [now, setNow] = useState(() => Date.now());

  // Always tick while mounted so the label stays second-accurate even if the
  // DND row is refreshed or the tab was backgrounded.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!info?.active) return null;

  const remaining = endsAtTime !== null ? endsAtTime - now : null;
  if (remaining !== null && remaining <= 0) return null;

  const endsLabel = endsAtTime !== null
    ? `until ${new Date(endsAtTime).toLocaleString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "";
  const title = info.note
    ? `Away — ${info.note}${endsLabel ? ` (${endsLabel})` : ""}`
    : `Away${endsLabel ? ` ${endsLabel}` : ""}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-violet-500 text-white ring-1 ring-violet-200/70 font-bold tabular-nums shadow-[0_0_10px_2px_rgba(168,85,247,0.6)] animate-pulse",
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs",
        className,
      )}
      title={title}
    >
      <Moon className={compact ? "size-3" : "size-3.5"} />
      <span>Away{remaining !== null ? ` • ${formatRemaining(remaining)}` : ""}</span>
    </span>
  );
}

