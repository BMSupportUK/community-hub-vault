import { useDndStatus } from "@/hooks/use-dnd";
import { cn } from "@/lib/utils";

export type PresenceKind = "dnd" | "online" | "offline";

/** Resolves a user's presence, treating active DND as the dominant state. */
export function usePresence(
  userId: string | null | undefined,
  isOnline: boolean,
): { kind: PresenceKind; label: string; shortLabel: string } {
  const dnd = useDndStatus(userId);
  if (dnd?.active) {
    const until = dnd.endsAt
      ? dnd.endsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : null;
    const label = dnd.note
      ? `Do Not Disturb — ${dnd.note}`
      : until
        ? `Do Not Disturb until ${until}`
        : "Do Not Disturb";
    return { kind: "dnd", label, shortLabel: "Do Not Disturb" };
  }
  if (isOnline) return { kind: "online", label: "Online", shortLabel: "Online" };
  return { kind: "offline", label: "Offline", shortLabel: "Offline" };
}

const BIG_DOT: Record<PresenceKind, string> = {
  dnd: "bg-violet-500 shadow-[0_0_8px_rgba(167,139,250,0.9)]",
  online: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]",
  offline: "bg-zinc-500",
};
const SMALL_DOT: Record<PresenceKind, string> = {
  dnd: "bg-violet-500",
  online: "bg-emerald-500",
  offline: "bg-zinc-500",
};
const TEXT_CLASS: Record<PresenceKind, string> = {
  dnd: "text-violet-300",
  online: "text-emerald-400",
  offline: "text-muted-foreground",
};

export function PresenceDot({
  userId,
  isOnline,
  ringClass,
  className,
}: {
  userId: string | null | undefined;
  isOnline: boolean;
  ringClass?: string;
  className?: string;
}) {
  const { kind, shortLabel } = usePresence(userId, isOnline);
  return (
    <span
      title={shortLabel}
      aria-label={shortLabel}
      className={cn(
        "absolute -bottom-0.5 -right-0.5 size-4 rounded-full ring-2",
        ringClass,
        BIG_DOT[kind],
        className,
      )}
    />
  );
}

/** Small dot + label, used inside list rows. Falls back to provided offline text. */
export function PresenceInline({
  userId,
  isOnline,
  offlineText,
  offlineTextClass,
}: {
  userId: string | null | undefined;
  isOnline: boolean;
  offlineText: string;
  offlineTextClass?: string;
}) {
  const { kind, shortLabel } = usePresence(userId, isOnline);
  const text = kind === "dnd" ? shortLabel : kind === "online" ? "Online" : offlineText;
  return (
    <>
      <span className={cn("size-1.5 rounded-full", SMALL_DOT[kind])} />
      <span className={kind === "offline" ? offlineTextClass ?? TEXT_CLASS.offline : TEXT_CLASS[kind]}>
        {text}
      </span>
    </>
  );
}

/** Tiny dot variant used in tight UIs (chat message headers). */
export function PresenceMiniDot({
  userId,
  isOnline,
  ringClass,
}: {
  userId: string | null | undefined;
  isOnline: boolean;
  ringClass?: string;
}) {
  const { kind, shortLabel } = usePresence(userId, isOnline);
  return (
    <span
      aria-label={shortLabel}
      className={cn("size-2 rounded-full ring-1", ringClass ?? "ring-background", SMALL_DOT[kind])}
    />
  );
}

export function PresenceMiniLabel({
  userId,
  isOnline,
  offlineText,
}: {
  userId: string | null | undefined;
  isOnline: boolean;
  offlineText: string;
}) {
  const { kind, shortLabel } = usePresence(userId, isOnline);
  const text = kind === "dnd" ? shortLabel : kind === "online" ? "Online" : offlineText;
  return <span className={kind === "dnd" ? "text-violet-300" : undefined}>{text}</span>;
}