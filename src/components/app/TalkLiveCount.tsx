import { cn } from "@/lib/utils";
import { useTalkChannelTotalCount } from "@/hooks/use-talk-channel-presence";

/**
 * Live count of the people currently in the Talk channels, shown on the
 * portal tabs' Talk link — the same number the side rail badge used to carry.
 * It only displays the total from the shared presence scan; it never tracks,
 * broadcasts or refines presence itself.
 */
export function TalkLiveCount({ className }: { className?: string }) {
  const count = useTalkChannelTotalCount();
  if (!count) return null;
  return (
    <span
      role="status"
      aria-label={`${count} ${count === 1 ? "person" : "people"} in Talk`}
      className={cn(
        "ml-1.5 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white shadow",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
