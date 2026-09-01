import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, User, UserPlus, Check, Clock, EyeOff, Eye, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTalkChannelPresentUsers } from "@/hooks/use-talk-channel-presence";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Nameplate } from "@/components/app/Nameplate";
import { TalkMemberMiniProfile } from "@/components/app/TalkMemberProfileCard";
import { useRoleFlashMap, roleFlashClass, resolveAvatarUrl } from "@/lib/role-flash";
import { formatRoleLabel } from "@/lib/role-label";
import { cn } from "@/lib/utils";
import pubBg from "@/assets/members-pub-bg.jpg.asset.json";


type MemberProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  equipped_nameplate_id: string | null;
  custom_status: string | null;
  created_at: string | null;
  last_seen_at: string | null;
};

type DirectoryRow = Omit<MemberProfile, "id"> & {
  user_id: string;
  roles: string[] | null;
};

type FriendState = { kind: "friends" | "outgoing" | "incoming"; id?: string };

const HIDDEN_ROLES = new Set(["pending", "banned", "rejected"]);
const STAFF_ROLES = new Set(["admin", "management", "moderator", "staff"]);

/** Boro Fan Zone roles are hidden here — this list only shows BM Support roles. */
function isFanZoneRole(role: string): boolean {
  return role.toLowerCase().includes("fan_zone") || role.toLowerCase().includes("an__one");
}
function bmSupportRoles(roles: string[]): string[] {
  return roles.filter((r) => !isFanZoneRole(r));
}

/**
 * Roles shown in the members list. Members without an explicit subscriber
 * role are surfaced as "Non Subscriber" so the filter always covers them.
 */
function displayRoles(roles: string[]): string[] {
  const base = bmSupportRoles(roles);
  const hasSub = base.some((r) => r === "subscriber");
  const hasNon = base.some((r) => r === "nonsubscriber");
  if (!hasSub && !hasNon) return [...base, "nonsubscriber"];
  return base;
}


/** Human relative age, e.g. "7 months ago". */
function relativeSince(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/** Absolute last-active stamp, e.g. "31 Aug 2026, 15:18". */
function lastActiveStamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "Members online · N" button + full-page dialog listing every member who is
 * currently online, with view profile / add friend / ignore actions.
 */
export function OnlineMembersDialog({ className }: { className?: string }) {
  const { user } = useAuth();
  // This control lives in Talk Channels, so its count and list must use the
  // talk-channel presence feed rather than the separate site-wide presence.
  const onlineIds = useTalkChannelPresentUsers();
  const roleFlashMap = useRoleFlashMap();
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});
  const [friendByUser, setFriendByUser] = useState<Record<string, FriendState>>({});
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusTab, setStatusTab] = useState<"online" | "offline">("online");


  const loadDirectory = useCallback(async () => {
    const { data, error } = await supabase.rpc("talk_channel_member_directory");
    if (error) {
      console.error("Could not load Talk Channel member directory", error);
      return;
    }
    const rows = (data as DirectoryRow[] | null) ?? [];
    setProfiles(rows.map((row) => ({
      id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      equipped_nameplate_id: row.equipped_nameplate_id,
      custom_status: row.custom_status,
      created_at: (row as unknown as { created_at?: string | null }).created_at ?? null,
      last_seen_at: (row as unknown as { last_seen_at?: string | null }).last_seen_at ?? null,
    })));
    const map: Record<string, string[]> = {};
    for (const row of rows) {
      map[row.user_id] = row.roles ?? [];
    }
    setRolesByUser(map);
  }, []);

  const loadRelations = useCallback(async () => {
    if (!user) return;
    const [{ data: fs }, { data: igs }] = await Promise.all([
      supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
      supabase.from("user_ignores").select("ignored_id").eq("ignorer_id", user.id),
    ]);
    const fmap: Record<string, FriendState> = {};
    for (const f of ((fs as Array<{ id: string; requester_id: string; addressee_id: string; status: string }> | null) ?? [])) {
      const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
      if (f.status === "accepted") {
        if (f.requester_id === user.id) fmap[otherId] = { kind: "friends", id: f.id };
      } else if (f.requester_id === user.id) {
        fmap[otherId] = { kind: "outgoing" };
      } else {
        fmap[otherId] = { kind: "incoming", id: f.id };
      }
    }
    setFriendByUser(fmap);
    setIgnored(new Set(((igs as Array<{ ignored_id: string }> | null) ?? []).map((r) => r.ignored_id)));
  }, [user?.id]);

  // Load the safe member directory independently from Presence. Enter/leave
  // events must never wait for a database request or be overwritten by an
  // older response that finishes late.
  useEffect(() => {
    void loadDirectory();
    const refresh = () => void loadDirectory();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadDirectory]);

  useEffect(() => {
    if (!open) return;
    void loadRelations();
  }, [open, loadRelations]);


  const sendRequest = async (toId: string) => {
    if (!user) return;
    setBusyId(toId);
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: toId });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Friend request sent");
    void loadRelations();
  };

  const acceptRequest = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Friends");
    void loadRelations();
  };

  const toggleIgnore = async (targetId: string) => {
    if (!user) return;
    const roles = rolesByUser[targetId] ?? [];
    if (roles.some((r) => STAFF_ROLES.has(r))) return toast.error("Staff members cannot be ignored.");
    setBusyId(targetId);
    if (ignored.has(targetId)) {
      const { error } = await supabase
        .from("user_ignores")
        .delete()
        .eq("ignorer_id", user.id)
        .eq("ignored_id", targetId);
      setBusyId(null);
      if (error) return toast.error(error.message);
      toast.success("User unignored");
    } else {
      const { error } = await supabase
        .from("user_ignores")
        .insert({ ignorer_id: user.id, ignored_id: targetId });
      setBusyId(null);
      if (error) return toast.error(error.message);
      toast.success("User ignored — their messages are hidden");
    }
    void loadRelations();
  };

  /** All non-staff members are listed; the green dot marks who is online. */
  const memberProfiles = useMemo(
    () =>
      profiles.filter((p) => {
        const roles = rolesByUser[p.id] ?? [];
        if (roles.some((r) => HIDDEN_ROLES.has(r))) return false;
        if (roles.some((r) => STAFF_ROLES.has(r))) return false;
        return true;
      }),
    [profiles, rolesByUser],
  );

  // A member can join Talk Channels before their profile row is cached here,
  // so pull the directory again whenever presence reports someone unknown.
  useEffect(() => {
    if (onlineIds.size === 0) return;
    const known = new Set(profiles.map((p) => p.id));
    for (const id of onlineIds) {
      if (!known.has(id)) {
        void loadDirectory();
        return;
      }
    }
  }, [onlineIds, profiles, loadDirectory]);

  /** Distinct member roles present for the Talk Channel filter. */
  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of memberProfiles) for (const r of displayRoles(rolesByUser[p.id] ?? [])) set.add(r);
    return Array.from(set).sort();
  }, [memberProfiles, rolesByUser]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return memberProfiles
      .filter((p) => {
        const roles = displayRoles(rolesByUser[p.id] ?? []);
        if (onlineIds.has(p.id) !== (statusTab === "online")) return false;
        if (roleFilter !== "all" && !roles.includes(roleFilter)) return false;
        if (!term) return true;
        return (
          (p.display_name ?? "").toLowerCase().includes(term) ||
          (p.username ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const aTime = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
        const bTime = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;
        return (a.display_name || a.username || "").localeCompare(b.display_name || b.username || "");
      });
  }, [memberProfiles, rolesByUser, q, roleFilter, onlineIds, statusTab]);




  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="View members"
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-2/60 hover:bg-surface-2 border border-white/10 hover:border-white/20 transition-all cursor-pointer shadow-lg shadow-black/20",
            className,
          )}
        >
          <Users className="size-4 text-primary" />
          <span className="text-xs font-semibold tracking-wide text-foreground/90">Members</span>
        </button>
      </DialogTrigger>

      <DialogContent
        className="max-w-none w-screen h-screen sm:h-screen rounded-none border-0 p-0 gap-0 flex flex-col overflow-hidden bg-background"
      >
        {/* Pub illustration backdrop, blended behind the whole directory */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-25"
          style={{ backgroundImage: `url(${pubBg.url})` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/90 via-background/80 to-background"
        />
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <div className="flex flex-wrap items-center gap-3">
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Users className="size-5 text-primary" />
              Members
            </DialogTitle>
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by username"
                className="pl-8 bg-surface-2/70 border-border text-foreground placeholder:text-muted-foreground focus-visible:border-primary"
              />
            </div>
          </div>
          {roleOptions.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Filter by role</span>
              {["all", ...roleOptions].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                    roleFilter === r
                      ? "border-emerald-400/50 bg-emerald-500/25 text-emerald-200"
                      : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10",
                  )}
                >
                  {r === "all" ? "All" : formatRoleLabel(r)}
                </button>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="grid shrink-0 grid-cols-2 border-b border-white/10 bg-neutral-950 px-5 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStatusTab("online")}
            className={cn(
              "h-10 rounded-none border-b-2 text-xs font-bold uppercase",
              statusTab === "online"
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-white/50 hover:text-white",
            )}
          >
            Online
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStatusTab("offline")}
            className={cn(
              "h-10 rounded-none border-b-2 text-xs font-bold uppercase",
              statusTab === "offline"
                ? "border-white text-white"
                : "border-transparent text-white/50 hover:text-white",
            )}
          >
            Offline
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur">
              <tr className="text-[10px] uppercase tracking-wider text-white/50">
                <th className="px-5 py-3 text-left font-bold">Name</th>
                <th className="px-4 py-3 text-left font-bold">Member since</th>
                <th className="px-4 py-3 text-left font-bold">Status</th>
                <th className="px-4 py-3 text-left font-bold">Last active</th>
                <th className="px-4 py-3 text-left font-bold">Roles</th>
                <th className="px-5 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-white/60">
                    No members match your filters.
                  </td>
                </tr>
              ) : (
                visible.map((p) => {
                  const name = p.display_name || p.username || "Member";
                  const role = roleFlashMap.get(p.id);
                  const rel = friendByUser[p.id];
                  const isSelf = p.id === user?.id;
                  const isIgnored = ignored.has(p.id);
                  const isOnline = onlineIds.has(p.id);
                  const busy = busyId === p.id || (rel?.id && busyId === rel.id);
                  const roles = displayRoles(rolesByUser[p.id] ?? []);
                  return (
                    <tr
                      key={p.id}
                      className="border-t border-white/5 hover:bg-white/[0.04] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <TalkMemberMiniProfile
                          userId={p.id}
                          fallback={{
                            display_name: p.display_name,
                            username: p.username,
                            avatar_url: p.avatar_url,
                            equipped_nameplate_id: p.equipped_nameplate_id,
                            roles: rolesByUser[p.id] ?? [],
                            created_at: p.created_at,
                            last_seen_at: p.last_seen_at,
                          }}
                          online={isOnline}
                          asDialog
                        >
                          <span className="flex items-center gap-3 min-w-0 text-left cursor-pointer group/name">
                            <span className="relative shrink-0">
                              <img
                                src={resolveAvatarUrl(p.id, p.avatar_url, roleFlashMap)}
                                alt={name}
                                className="size-9 rounded-full object-cover ring-2 ring-white/15 transition-all group-hover/name:ring-primary/50"
                              />
                              <span
                                className={cn(
                                  "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-neutral-950",
                                  isOnline ? "bg-emerald-500" : "bg-neutral-500",
                                )}
                              />
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span
                                className={cn(
                                  "truncate text-sm font-bold text-white transition-colors group-hover/name:text-primary",
                                  roleFlashClass(role),
                                )}
                              >
                                {name}
                              </span>
                              {p.username && (
                                <span className="truncate text-xs text-white/60">
                                  @{p.username}
                                </span>
                              )}
                            </div>
                          </span>
                        </TalkMemberMiniProfile>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-white/80">
                        {relativeSince(p.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-top">
                        <div className="flex flex-col gap-1">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider w-fit",
                              isOnline
                                ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                                : "border-white/15 bg-white/5 text-white/50",
                            )}
                          >
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                isOnline ? "bg-emerald-400" : "bg-neutral-500",
                              )}
                            />
                            {isOnline ? "Online" : "Offline"}
                          </span>
                          {p.custom_status && (
                            <span className="text-[11px] text-white/70 truncate max-w-[160px]">
                              {p.custom_status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-white/70">
                        {isOnline ? "Now" : lastActiveStamp(p.last_seen_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap gap-1">
                          {roles.length === 0 ? (
                            <span className="text-xs text-white/40">—</span>
                          ) : (
                            roles.map((r) => (
                              <span
                                key={r}
                                className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80"
                              >
                                {formatRoleLabel(r)}
                              </span>
                            ))
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <TalkMemberMiniProfile
                            userId={p.id}
                            fallback={{
                              display_name: p.display_name,
                              username: p.username,
                              avatar_url: p.avatar_url,
                              equipped_nameplate_id: p.equipped_nameplate_id,
                              roles: rolesByUser[p.id] ?? [],
                              created_at: p.created_at,
                              last_seen_at: p.last_seen_at,
                            }}
                            online={isOnline}
                            asDialog
                          >
                            <span className="flex h-8 items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2.5 text-xs font-medium text-white hover:bg-white/20 cursor-pointer">
                              <User className="size-3.5" />
                              Profile
                            </span>
                          </TalkMemberMiniProfile>
                          {!isSelf && (
                            <>
                              {rel?.kind === "friends" ? (
                                <Button size="sm" variant="secondary" disabled className="h-8 bg-emerald-500/25 text-emerald-100 border border-emerald-300/30" aria-label="Already friends">
                                  <Check className="size-3.5" />
                                </Button>
                              ) : rel?.kind === "outgoing" ? (
                                <Button size="sm" variant="secondary" disabled className="h-8 bg-white/10 text-white/70 border border-white/20" aria-label="Friend request pending">
                                  <Clock className="size-3.5" />
                                </Button>
                              ) : rel?.kind === "incoming" ? (
                                <Button size="sm" disabled={!!busy} onClick={() => rel.id && acceptRequest(rel.id)} className="h-8" aria-label="Accept friend request">
                                  <Check className="size-3.5" />
                                </Button>
                              ) : (
                                <Button size="sm" disabled={!!busy} onClick={() => sendRequest(p.id)} className="h-8" aria-label={`Add ${name} as a friend`} title="Add friend">
                                  <UserPlus className="size-3.5" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={!!busy}
                                onClick={() => toggleIgnore(p.id)}
                                className={cn(
                                  "h-8 border",
                                  isIgnored
                                    ? "bg-rose-500/25 text-rose-100 border-rose-300/30 hover:bg-rose-500/35"
                                    : "bg-white/10 text-white border-white/20 hover:bg-white/20",
                                )}
                                aria-label={isIgnored ? `Unignore ${name}` : `Ignore ${name}`}
                                title={isIgnored ? "Unignore" : "Ignore"}
                              >
                                {isIgnored ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

