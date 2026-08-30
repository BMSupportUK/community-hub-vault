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
