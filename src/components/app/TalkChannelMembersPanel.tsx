import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Users, MessageSquare, User as UserIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTalkChannelPresentUsers } from "@/hooks/use-talk-channel-presence";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Nameplate } from "@/components/app/Nameplate";
import { useRoleFlashMap, roleFlashClass, resolveAvatarUrl } from "@/lib/role-flash";
import { formatRoleLabel } from "@/lib/role-label";
import { sortRolesByPriority, highestRole } from "@/lib/role-rank";
import { formatLastSeen } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

type DirectoryRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  equipped_nameplate_id: string | null;
  roles: string[] | null;
  created_at: string | null;
  last_seen_at: string | null;
};

const HIDDEN_ROLES = new Set(["pending", "banned", "rejected"]);
const STAFF_ROLES = new Set(["admin", "management", "moderator", "staff"]);

/** Role colour for the Discord-style grouped list headings and names. */
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
 * Members tab inside Talk Channels. It lists every non-staff member and marks
 * members currently present in Talk Channels with a live green status dot.
 */
export function TalkChannelMembersPanel() {
  const { user } = useAuth();
  const onlineIds = useTalkChannelPresentUsers();
  const roleFlashMap = useRoleFlashMap();
  const [rows, setRows] = useState<DirectoryRow[] | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("talk_channel_member_directory");
    if (error) {
      console.error("Could not load Talk Channel member directory", error);
      setRows([]);
      return;
    }
    setRows((data as DirectoryRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    const t = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(t);
    };
  }, [load]);

  const members = useMemo(
    () =>
      (rows ?? []).filter((r) => {
        const roles = r.roles ?? [];
        if (roles.some((role) => HIDDEN_ROLES.has(role))) return false;
        if (roles.some((role) => STAFF_ROLES.has(role))) return false;
        return true;
      }),
    [rows],
  );

  /** Online members bucketed by highest role, offline collected separately. */
  const groups = useMemo(() => {
    const online = members.filter((m) => onlineIds.has(m.user_id));
    const offline = members.filter((m) => !onlineIds.has(m.user_id));
    const byRole = new Map<string, DirectoryRow[]>();
    for (const m of online) {
      const top = highestRole(sortRolesByPriority(m.roles ?? [])) ?? "member";
      const list = byRole.get(top) ?? [];
      list.push(m);
      byRole.set(top, list);
    }
    const sortByName = (a: DirectoryRow, b: DirectoryRow) =>
      (a.display_name || a.username || "").localeCompare(b.display_name || b.username || "");
    const ordered = Array.from(byRole.entries())
      .map(([role, list]) => ({ role, list: list.sort(sortByName) }))
      .sort((a, b) => {
        const order = sortRolesByPriority([a.role, b.role]);
        return order[0] === a.role ? -1 : 1;
      });
    return { ordered, offline: offline.sort(sortByName) };
  }, [members, onlineIds]);

  if (rows === null) {
    return (
      <div className="flex h-full items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <Users className="size-3.5" />
        Members
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {onlineCount} in chat
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-3">
        {groups.ordered.map(({ role, list }) => (
          <section key={role}>
            <h3
              className={cn(
                "px-1 pb-1 text-[10px] font-bold uppercase tracking-wider",
                ROLE_TEXT[role] ?? "text-muted-foreground",
              )}
            >
              {formatRoleLabel(role)}
            </h3>
            <div className="space-y-0.5">
              {list.map((m) => (
                <MemberRow
                  key={m.user_id}
                  row={m}
                  online
                  selfId={user?.id ?? null}
                  roleFlashMap={roleFlashMap}
                />
              ))}
            </div>
          </section>
        ))}

        {groups.offline.length > 0 && (
          <section>
            <h3 className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Offline
            </h3>
            <div className="space-y-0.5">
              {groups.offline.map((m) => (
                <MemberRow
                  key={m.user_id}
                  row={m}
                  online={false}
                  selfId={user?.id ?? null}
                  roleFlashMap={roleFlashMap}
                />
              ))}
            </div>
          </section>
        )}

        {members.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">No members yet.</p>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  row,
  online,
  selfId,
  roleFlashMap,
}: {
  row: DirectoryRow;
  online: boolean;
  selfId: string | null;
  roleFlashMap: ReturnType<typeof useRoleFlashMap>;
}) {
  const name = row.display_name || row.username || "Member";
  const flash = roleFlashMap.get(row.user_id);
  const roles = sortRolesByPriority(row.roles ?? []);
  const top = highestRole(roles) ?? "member";
  const avatar = resolveAvatarUrl(row.user_id, row.avatar_url, roleFlashMap);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !online && "opacity-50",
          )}
        >
          <span className="relative shrink-0">
            <img src={avatar} alt="" className="size-8 rounded-full object-cover" />
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-surface",
                online ? "bg-emerald-500" : "bg-zinc-500",
              )}
            />
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium",
              ROLE_TEXT[top] ?? "text-foreground",
              roleFlashClass(flash),
            )}
          >
            {name}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="left"
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      >
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
      </PopoverContent>
    </Popover>
  );
}

/** Private per-viewer note, stored locally like Discord's member note. */
function MemberNote({ userId }: { userId: string }) {
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
