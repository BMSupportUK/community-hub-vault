import { Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDndStatus } from "@/hooks/use-dnd";

/** Renders a small "DND" pill if the given user is currently in Do Not Disturb mode. */
export function DndBadge({
  userId,
  className,
  compact = false,
}: {
  userId: string | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  const info = useDndStatus(userId);
  if (!info?.active) return null;

  const title = info.note
    ? `Do Not Disturb — ${info.note}`
    : info.endsAt
      ? `Do Not Disturb until ${info.endsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Do Not Disturb";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/40 font-semibold",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        className,
      )}
      title={title}
    >
      <Moon className={compact ? "size-2.5" : "size-3"} />
      {!compact && "DND"}
    </span>
  );
}