import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
}: {
  profile: ChatMiniProfileData;
  children: ReactNode;
  className?: string;
}) {
  const { name, username, avatarUrl, hasAvatar, role, isOnline, lastSeenAt, isSelf } = profile;
  const initial = (name || "?").slice(0, 1).toUpperCase();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`View ${name}'s profile`}
          className={cn(
            "cursor-pointer rounded-md text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0 overflow-hidden">
        <div className="bg-gradient-primary h-14" />
        <div className="px-4 pb-4 -mt-7">
          {hasAvatar ? (
            <img
              src={avatarUrl}
              alt=""
              className="size-14 rounded-full object-cover ring-2 ring-background"
            />
          ) : (
            <div className="size-14 rounded-full bg-gradient-primary grid place-items-center text-lg font-semibold text-primary-foreground ring-2 ring-background">
              {initial}
            </div>
          )}
          <div className="mt-2 min-w-0">
            <Nameplate
              id={profile.nameplateId}
              className="inline-flex items-center rounded-md px-3 py-1.5 min-w-0 shadow-sm isolate"
              fallbackStyle={{
                background: "linear-gradient(135deg, #1a4a2a 0%, #2d6a3f 50%, #1a4a2a 100%)",
              }}
            >
              <span className="relative z-10 truncate text-sm font-semibold">{name}</span>
            </Nameplate>
            {username && (
              <p className="mt-1 truncate text-xs text-muted-foreground">@{username}</p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
      </PopoverContent>
    </Popover>
  );
}
