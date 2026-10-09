import { Link, useRouterState } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";
import { useBmInbox } from "@/lib/bm-inbox";

/**
 * BM Support Inbox entry for the top header, sitting just before the mentions
 * icon. Role-gated by the same rule the inbox page uses, so anyone without
 * inbox access never sees the button at all.
 */
export function BmInboxBell() {
  const inbox = useBmInbox();
  const path = useRouterState({ select: (r) => r.location.pathname });
  if (!inbox.enabled) return null;

  const unread = inbox.data?.unread ?? 0;
  const active = path === "/inbox" || path.startsWith("/inbox/");

  return (
    <Link
      to="/inbox"
      aria-label="BM Support Inbox"
      title={unread > 0 ? `${unread} unread inbox message${unread === 1 ? "" : "s"}` : "BM Support Inbox"}
      className={`relative size-11 shrink-0 rounded-lg flex items-center justify-center transition-all ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-surface-2 text-muted-foreground hover:bg-primary hover:text-primary-foreground"
      }`}
    >
      <MessagesSquare className="size-5" />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center ring-2 ring-rail">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
