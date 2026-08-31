import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Nameplate } from "@/components/app/Nameplate";
import { PresenceMiniDot } from "@/components/app/PresenceIndicators";
import { formatLastSeen } from "@/lib/relative-time";
import { formatRoleLabel } from "@/lib/role-label";
import type { FlashRole } from "@/lib/role-flash";
import { cn } from "@/lib/utils";

export type ChatMiniProfileData = {
  userId: string;
  name: string;
  username?: string | null;
  avatarUrl: string;
  hasAvatar: boolean;
  nameplateId?: string | null;
  role?: FlashRole | null;
  isOnline: boolean;
  lastSeenAt?: string | null;
  customStatus?: string | null;
  isSelf?: boolean;
};

const ROLE_BADGE: Record<FlashRole, string> = {
  admin: "border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-300",
  management: "border-sky-500/60 bg-sky-500/15 text-sky-600 dark:text-sky-300",
  moderator: "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  staff: "border-indigo-500/60 bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
};

/**
 * Wraps a clickable chat element (avatar or name) and pops up a compact
 * profile card for that user: avatar, display name, @username, role and
 * presence. Presentation only — no data fetching or permission changes.
 */
export function ChatMiniProfile({
  profile,
  children,
  className,
  /**
   * Render the card in a modal Dialog instead of a Popover. Required when the
   * trigger already sits inside a modal dialog, where a portalled popover is
   * not interactive.
   */
  asDialog,
}: {
  profile: ChatMiniProfileData;
  children: ReactNode;
  className?: string;
  asDialog?: boolean;
}) {
  const { name } = profile;
  const triggerClass = cn(
    "cursor-pointer rounded-md text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );

  if (asDialog) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <button type="button" aria-label={`View ${name}'s profile`} className={triggerClass}>
            {children}
          </button>
        </DialogTrigger>
        <DialogContent className="w-80 max-w-[calc(100vw-2rem)] p-0 overflow-hidden gap-0">
          <DialogTitle className="sr-only">{name}</DialogTitle>
          <MiniProfileCard profile={profile} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`View ${name}'s profile`} className={triggerClass}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0 overflow-hidden">
        <MiniProfileCard profile={profile} />
      </PopoverContent>
    </Popover>
  );
}

function MiniProfileCard({ profile }: { profile: ChatMiniProfileData }) {
  const { name, username, avatarUrl, hasAvatar, role, isOnline, lastSeenAt, isSelf } = profile;
  const initial = (name || "?").slice(0, 1).toUpperCase();

  return (
    <>
        <div className="relative">
          <Nameplate
            id={profile.nameplateId}
            className="flex min-h-32 w-full flex-col justify-end rounded-none px-4 pb-4 pt-16 shadow-sm isolate"
            fallbackStyle={{
              background: "linear-gradient(135deg, hsl(var(--primary) / 0.45), hsl(var(--accent) / 0.35), hsl(var(--primary) / 0.55))",
            }}
          >
            <div className="relative z-10 min-w-0 pr-2">
              <div className="truncate text-xl font-bold leading-tight text-foreground drop-shadow-sm">{name}</div>
              {username && <div className="mt-1 truncate text-xs font-medium text-foreground/80">@{username}</div>}
            </div>
          </Nameplate>
          <div className="absolute left-4 top-4">
            {hasAvatar ? (
              <img
                src={avatarUrl}
                alt=""
                className="size-14 rounded-full object-cover ring-2 ring-background shadow-lg"
              />
            ) : (
              <div className="size-14 rounded-full bg-gradient-primary grid place-items-center text-lg font-semibold text-primary-foreground ring-2 ring-background shadow-lg">
                {initial}
              </div>
            )}
          </div>
        </div>
        <div className="px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {role && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                  ROLE_BADGE[role],
                )}
              >
                {formatRoleLabel(role)}
              </span>
            )}
            {isSelf && (
              <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                You
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <PresenceMiniDot userId={profile.userId} isOnline={isOnline} />
            <span>{isOnline ? "Online now" : `Active ${formatLastSeen(lastSeenAt)}`}</span>
          </div>
          {username && (
            <div className="mt-3">
              <Link
                to="/u/$username"
                params={{ username }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <User className="size-4" />
                View full profile
              </Link>
            </div>
          )}
        </div>
    </>
  );
}
