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
  const [activeTab, setActiveTab] = useState<"online" | "offline">("online");

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
    const sortByLatest = (a: DirectoryRow, b: DirectoryRow) => {
      const aDate = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
      const bDate = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
      return bDate - aDate;
    };
    const ordered = Array.from(byRole.entries())
      .map(([role, list]) => ({ role, list: list.sort(sortByLatest) }))
      .sort((a, b) => {
        const order = sortRolesByPriority([a.role, b.role]);
        return order[0] === a.role ? -1 : 1;
      });
    return { ordered, offline: offline.sort(sortByLatest) };
  }, [members, onlineIds]);

  // LOCKED: Members panel header counter — online non-staff members only.
  // Do not change, restyle, or remove without explicit authorisation. See mem://constraints/chat-counters-locked
  const membersInChat = groups.ordered.reduce((total, group) => total + group.list.length, 0);

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
        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-emerald-300">
          {membersInChat}
        </span>
      </div>

      <div className="shrink-0 grid grid-cols-2 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("online")}
          className={cn(
            "px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
            activeTab === "online"
              ? "bg-surface text-emerald-300"
              : "text-muted-foreground hover:text-foreground hover:bg-surface-2/50",
          )}
        >
          Online
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("offline")}
          className={cn(
            "px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
            activeTab === "offline"
              ? "bg-surface text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-surface-2/50",
          )}
        >
          Offline
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-3">
        {activeTab === "online" && (
          <>
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
            {groups.ordered.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">No members online.</p>
            )}
          </>
        )}

        {activeTab === "offline" && (
          <>
            {groups.offline.length > 0 ? (
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
            ) : (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">No members offline.</p>
            )}
          </>
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
        <TalkMemberProfileCard row={row} online={online} selfId={selfId} />
      </PopoverContent>
    </Popover>
  );
}
