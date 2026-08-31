import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MessageSquare, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Nameplate } from "@/components/app/Nameplate";
import { useRoleFlashMap, resolveAvatarUrl } from "@/lib/role-flash";
import { formatRoleLabel } from "@/lib/role-label";
import { sortRolesByPriority } from "@/lib/role-rank";
import { formatLastSeen } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

export type TalkMemberProfileRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  equipped_nameplate_id: string | null;
  roles: string[] | null;
  created_at: string | null;
  last_seen_at: string | null;
};

/** Role colour used for the role dots inside the card. */
const ROLE_TEXT: Record<string, string> = {
  admin: "text-rose-300",
  management: "text-fuchsia-300",
  moderator: "text-amber-300",
  staff: "text-sky-300",
  subscriber: "text-emerald-300",
  boro_fan_zone_moderator: "text-orange-300",
  boro_fan_zone_member: "text-teal-300",
};

/**
 * The single Discord-style member card used everywhere in Talk Channels —
 * both the side members list and clicking a name/avatar inside the chat.
 */
export function TalkMemberProfileCard({
  row,
  online,
  selfId,
}: {
  row: TalkMemberProfileRow;
  online: boolean;
  selfId: string | null;
}) {
  const roleFlashMap = useRoleFlashMap();
  const name = row.display_name || row.username || "Member";
  const roles = sortRolesByPriority(row.roles ?? []);

  return (
    <>
      {/* Banner + avatar */}
      <div className="relative">
        <Nameplate
          id={row.equipped_nameplate_id}
          className="flex min-h-28 w-full flex-col justify-end rounded-none px-4 pb-3 pt-14 isolate"
          fallbackStyle={{
            background:
              "linear-gradient(135deg, hsl(var(--primary) / 0.45), hsl(var(--accent) / 0.35), hsl(var(--primary) / 0.55))",
          }}
        >
          <div className="relative z-10 min-w-0">
            <div className="truncate text-xl font-bold leading-tight text-foreground drop-shadow-sm">
              {name}
            </div>
            {row.username && (
              <div className="mt-0.5 truncate text-xs font-medium text-foreground/80">
                @{row.username}
              </div>
            )}
          </div>
        </Nameplate>
        <div className="absolute left-4 top-3">
          <span className="relative inline-block">
            <img
              src={resolveAvatarUrl(row.user_id, row.avatar_url, roleFlashMap)}
              alt=""
              className="size-14 rounded-full object-cover ring-2 ring-background shadow-lg"
            />
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-4 rounded-full ring-4 ring-background",
                online ? "bg-emerald-500" : "bg-zinc-500",
              )}
            />
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="rounded-lg border border-border bg-surface-2/60 p-3 space-y-3">
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Member since
            </h4>
            <p className="mt-0.5 text-sm">
              {row.created_at
                ? new Date(row.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "Unknown"}
            </p>
          </div>

          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Roles
            </h4>
            <div className="mt-1 flex flex-wrap gap-1">
              {roles.length === 0 ? (
                <span className="text-xs text-muted-foreground">No roles</span>
              ) : (
                roles.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        (ROLE_TEXT[r] ?? "text-muted-foreground").replace("text-", "bg-"),
                      )}
                    />
                    {formatRoleLabel(r)}
                  </span>
                ))
              )}
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Status
            </h4>
            <p className="mt-0.5 text-sm">
              {online ? "Online now" : `Last seen ${formatLastSeen(row.last_seen_at)}`}
            </p>
          </div>

          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Note
            </h4>
            <MemberNote userId={row.user_id} />
          </div>
        </div>

        {row.user_id !== selfId && (
          <div className="rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <MessageSquare className="size-3.5 shrink-0" />
            Mention @{row.username ?? name} in the channel to message them.
          </div>
        )}

        {row.username && (
          <Link
            to="/u/$username"
            params={{ username: row.username }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <UserIcon className="size-4" />
            View full profile
          </Link>
        )}
      </div>
    </>
  );
}

/** Private per-viewer note, stored locally like Discord's member note. */
export function MemberNote({ userId }: { userId: string }) {
  const storageKey = `talk-member-note:${userId}`;
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      setNote(window.localStorage.getItem(storageKey) ?? "");
    } catch {
      setNote("");
    }
  }, [storageKey]);

  return (
    <textarea
      value={note}
      onChange={(e) => {
        setNote(e.target.value);
        try {
          window.localStorage.setItem(storageKey, e.target.value);
        } catch {
          /* storage unavailable */
        }
      }}
      rows={2}
      maxLength={240}
      placeholder="Click to add a note (only you can see this)"
      className="mt-1 w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
    />
  );
}

let directoryCache: Map<string, TalkMemberProfileRow> | null = null;
let directoryPromise: Promise<Map<string, TalkMemberProfileRow>> | null = null;

async function loadDirectory(force = false) {
  if (!force && directoryCache) return directoryCache;
  if (!force && directoryPromise) return directoryPromise;
  directoryPromise = (async () => {
    const { data, error } = await supabase.rpc("talk_channel_member_directory");
    const map = new Map<string, TalkMemberProfileRow>();
    if (!error) {
      for (const row of (data as TalkMemberProfileRow[] | null) ?? []) {
        map.set(row.user_id, row);
      }
      directoryCache = map;
    }
    directoryPromise = null;
    return map;
  })();
  return directoryPromise;
}

/**
 * Wraps a clickable chat element (avatar or name) and pops up the exact same
 * member card the Talk Channels side members list uses. Details that the chat
 * message list does not carry (roles, join date) are loaded on open.
 */
export function TalkMemberMiniProfile({
  userId,
  fallback,
  online,
  children,
  className,
  asDialog,
  side = "right",
}: {
  userId: string;
  fallback: Omit<TalkMemberProfileRow, "user_id">;
  online: boolean;
  children: ReactNode;
  className?: string;
  asDialog?: boolean;
  side?: "top" | "right" | "bottom" | "left";
}) {
  const { user } = useAuth();
  const [row, setRow] = useState<TalkMemberProfileRow>({ user_id: userId, ...fallback });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadDirectory().then((map) => {
      const found = map.get(userId);
      if (found && !cancelled) setRow(found);
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const name = row.display_name || row.username || "Member";
  const triggerClass = cn(
    "cursor-pointer rounded-md text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );
  const card = <TalkMemberProfileCard row={row} online={online} selfId={user?.id ?? null} />;

  if (asDialog) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button type="button" aria-label={`View ${name}'s profile`} className={triggerClass}>
            {children}
          </button>
        </DialogTrigger>
        <DialogContent className="w-80 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{name}</DialogTitle>
          {card}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`View ${name}'s profile`} className={triggerClass}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      >
        {card}
      </PopoverContent>
    </Popover>
  );
}
