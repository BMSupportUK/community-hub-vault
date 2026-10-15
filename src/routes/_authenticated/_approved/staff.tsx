import { useIsDemoAccount } from "@/hooks/use-demo-account";
import { DEMO_LATEST_ORDER, DEMO_MEMBERS, DEMO_STAFF, DEMO_ROLES, demoTickets, DEMO_PROFILE_MAP } from "@/lib/demo-data";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Briefcase, Search, Clock, UserPlus, Eye, Check, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import profileHeader from "@/assets/profile-header.jpg";
import profileHeaderManagement from "@/assets/profile-header-management.jpg";
import profileHeaderStaff from "@/assets/profile-header-staff.jpg";
import profileHeaderModerator from "@/assets/profile-header-moderator.jpg";
import { useOnlineUsers } from "@/hooks/use-online-users";
import { formatLastSeen } from "@/lib/relative-time";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { VpnBadge } from "@/lib/vpn-flags";
import { formatRoleLabel } from "@/lib/role-label";
import { PresenceDot, PresenceInline } from "@/components/app/PresenceIndicators";
import { DndCountdown } from "@/components/app/DndCountdown";
import { useShiftStatusMap } from "@/hooks/use-shift-status-map";
import { StaffBreakChip } from "@/components/app/StaffBreakChip";
import { Nameplate } from "@/components/app/Nameplate";
import { StaffEmploymentDates } from "@/components/app/StaffEmploymentDates";
import { staffEmploymentGroup, type StaffRecord } from "@/lib/staff-employment";

export const Route = createFileRoute("/_authenticated/_approved/staff")({
  head: () => ({ meta: [
    { title: "Staff Directory | BM Support" },
    { name: "description", content: "BM Support staff by role, employment dates and former staff records." },
    { property: "og:title", content: "Staff Directory | BM Support" },
    { property: "og:description", content: "BM Support staff by role, employment dates and former staff records." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: StaffPage,
});

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  is_private: boolean | null;
  last_seen_at: string | null;
  equipped_nameplate_id: string | null;
}
interface RoleRow { user_id: string; role: string }

type FriendState =
  | { kind: "none" }
  | { kind: "outgoing" }
  | { kind: "incoming"; id: string }
  | { kind: "friends"; id: string };

const ROLE_ORDER = ["admin", "management", "staff", "moderator"] as const;
const DIRECTORY_TABS = [...ROLE_ORDER, "former"];
const ROLE_LABEL: Record<string, string> = {
  admin: "Owners",
  management: "Management",
  moderator: "Moderators",
  staff: "Staff",
  former: "Staff who have left",
};
const ROLE_HEADER: Record<string, string> = {
  admin: profileHeaderManagement,
  management: profileHeaderManagement,
  moderator: profileHeaderModerator,
  staff: profileHeaderStaff,
};

function StaffPage() {
  const { user: viewer } = useAuth();
  const onlineUsers = useOnlineUsers();
  const isDemo = useIsDemoAccount();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});
  const [friendByUser, setFriendByUser] = useState<Record<string, FriendState>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [employment, setEmployment] = useState<Record<string, StaffRecord>>({});

  const load = async () => {
    if (isDemo) {
      setProfiles(DEMO_STAFF as Profile[]);
      const dm: Record<string, string[]> = {};
      for (const r of DEMO_ROLES) (dm[r.user_id] ||= []).push(r.role);
      setRolesByUser(dm);
      setEmployment(Object.fromEntries(DEMO_STAFF.map((p) => [p.id, { user_id: p.id, join_date: "2026-01-05", leave_date: null, roles: dm[p.id] ?? [], username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, bio: p.bio, equipped_nameplate_id: p.equipped_nameplate_id }])));
      return;
    }
    const [{ data: ps }, { data: rs }, { data: records, error: recordError }] = await Promise.all([
      supabase.from("profiles").select("*").order("display_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("staff_records").select("*"),
    ]);
    if (recordError) toast.error("Unable to load employment dates");
    const recordMap = Object.fromEntries((records ?? []).map((r) => [r.user_id, r]));
    setEmployment(recordMap);
    const directory = new Map(((ps as Profile[] | null) ?? []).map((p) => [p.id, p]));
    for (const r of records ?? []) {
      if (!r.leave_date) continue;
      const current = directory.get(r.user_id);
      directory.set(r.user_id, { ...current, id: r.user_id, username: r.username, display_name: r.display_name, avatar_url: r.avatar_url, bio: r.bio, equipped_nameplate_id: r.equipped_nameplate_id, created_at: current?.created_at ?? r.created_at, is_private: current?.is_private ?? false, last_seen_at: current?.last_seen_at ?? null });
    }
    setProfiles([...directory.values()]);
    const map: Record<string, string[]> = {};
    for (const r of (rs as RoleRow[] | null) ?? []) {
      (map[r.user_id] ||= []).push(r.role);
    }
    setRolesByUser(map);

    if (viewer) {
      const { data: fs } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status")
        .or(`requester_id.eq.${viewer.id},addressee_id.eq.${viewer.id}`);
      const fmap: Record<string, FriendState> = {};
      for (const f of (fs as any[] | null) ?? []) {
        const otherId = f.requester_id === viewer.id ? f.addressee_id : f.requester_id;
        if (f.status === "accepted") {
          if (f.requester_id === viewer.id) fmap[otherId] = { kind: "friends", id: f.id };
        }
        else if (f.requester_id === viewer.id) fmap[otherId] = { kind: "outgoing" };
        else fmap[otherId] = { kind: "incoming", id: f.id };
      }
      setFriendByUser(fmap);
    }
  };
  useEffect(() => { load(); }, [viewer?.id, isDemo]);

  const sendRequest = async (toId: string) => {
    if (!viewer) return;
    setBusyId(toId);
    const { error } = await supabase.from("friendships").insert({ requester_id: viewer.id, addressee_id: toId });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Friend request sent");
    load();
  };
  const acceptRequest = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Friends");
    load();
  };

  const STAFF_SET = new Set<string>(ROLE_ORDER);
  const staffProfiles = profiles.filter((p) =>
    staffEmploymentGroup(rolesByUser[p.id] ?? [], employment[p.id]) !== null
  );
  const filtered = staffProfiles.filter((p) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      (p.display_name ?? "").toLowerCase().includes(s) ||
      (p.username ?? "").toLowerCase().includes(s)
    );
  });

  // Live signed-in / on-break state for the staff shown on this page.
  const shiftStatus = useShiftStatusMap(filtered.map((p) => p.id));

  // Highest role per user (by ROLE_ORDER priority)
  const topRole = (uid: string): string => {
    const rs = rolesByUser[uid] ?? [];
    for (const r of ROLE_ORDER) if (rs.includes(r)) return r;
    return "staff";
  };

  const grouped: Record<string, Profile[]> = {};
  DIRECTORY_TABS.forEach((r) => (grouped[r] = []));
  filtered.forEach((p) => {
    const group = staffEmploymentGroup(rolesByUser[p.id] ?? [], employment[p.id]);
    if (group) grouped[group].push(p);
  });

  return (
    <Tabs defaultValue="admin">
      <div className="flex-1 overflow-y-auto bg-background">
        <header className="px-4 pt-6 pb-5 border-b border-border bg-surface/70 backdrop-blur sm:px-8 sm:pt-8 sm:pb-6">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 lg:flex lg:flex-wrap">
            <div className="size-11 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground shadow-glow shrink-0">
              <Briefcase className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-bold text-gradient-primary sm:text-3xl">
                Staff Directory
              </h1>
              <p className="text-muted-foreground mt-1">The people running the show — grouped by role.</p>
            </div>
            <div className="col-span-2 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:col-span-1 lg:ml-auto lg:flex lg:flex-wrap lg:items-center">
              <div className="relative w-full lg:w-64 lg:shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search staff…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface/70 border border-border text-purple-50 placeholder:text-muted-foreground/50 outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/40"
                />
              </div>
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-surface/70 border border-border p-1 sm:flex sm:w-auto sm:flex-wrap">
                {DIRECTORY_TABS.map((role) => (
                  <TabsTrigger
                    key={role}
                    value={role}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground"
                  >
                    {ROLE_LABEL[role]}
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2/70 border border-border">
                      {grouped[role].length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>
        </header>

        <div className="px-4 py-5 sm:px-8 sm:py-6">
          {DIRECTORY_TABS.map((role) => {
            const list = grouped[role];
            return (
              <TabsContent key={role} value={role} className="mt-6">
                <section>
                  <div
                    className="relative mb-4 w-full aspect-[15/4] rounded-2xl overflow-hidden border border-border bg-surface/80"
                    aria-hidden
                  >
                    <img
                      src={ROLE_HEADER[role] ?? profileHeaderStaff}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover object-center"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent" />
                    <div className="absolute inset-0 flex items-center gap-3 px-5">
                      <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground drop-shadow-lg">
                        {ROLE_LABEL[role]}
                      </h2>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2/70 text-foreground border border-border backdrop-blur">
                        {list.length}
                      </span>
                    </div>
                  </div>

                  {list.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground bg-surface/50">
                      No {ROLE_LABEL[role].toLowerCase()} found.
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {list.map((p) => {
                      const name = p.display_name ?? p.username ?? "Unknown";
                      const initial = name.slice(0, 1).toUpperCase();
                      const userRoles = role === "former" ? employment[p.id]?.roles ?? [] : rolesByUser[p.id] ?? [];
                      const isOnline = onlineUsers.has(p.id);
                      const brk = shiftStatus[p.id]?.break;
                      return (
                        <div
                          key={p.id}
                          className="group rounded-2xl bg-surface/70 border border-border hover:border-fuchsia-400/70 hover:shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-all overflow-hidden flex flex-col backdrop-blur"
                        >
                          <div className="relative h-16 bg-surface/80 overflow-hidden" aria-hidden>
                            <img
                              src={ROLE_HEADER[role] ?? profileHeader}
                              alt=""
                              className="h-full w-full object-cover object-center"
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                          <div className="px-4 -mt-8 pb-4 flex flex-col flex-1">
                            <div className="relative w-fit">
                              {p.avatar_url ? (
                                <img
                                  src={p.avatar_url}
                                  alt=""
                                  className="size-16 rounded-2xl object-cover ring-4 ring-surface"
                                />
                              ) : (
                                <div className="size-16 rounded-2xl ring-4 ring-surface bg-gradient-primary grid place-items-center text-primary-foreground text-xl font-bold">
                                  {initial}
                                </div>
                              )}
                              <PresenceDot
                                userId={p.id}
                                isOnline={isOnline}
                                ringClass="ring-surface"
                              />
                            </div>
                            <div className="mt-3">
                              <Link
                                to="/u/$username"
                                params={{ username: p.username ?? p.id }}
                                className="font-semibold text-sm text-foreground hover:text-primary-glow transition-colors"
                              >
                                <Nameplate id={p.equipped_nameplate_id} className="min-h-10 rounded-md bg-gradient-primary px-3 py-2">
                                  <span className="relative z-10 block pr-7">{name}</span>
                                </Nameplate>
                              </Link>
                              <span className="ml-1 inline-flex align-middle"><VpnBadge userId={p.id} size={12} /></span>
                              <div className="text-[10px] mt-0.5 flex flex-wrap items-center gap-1.5">
                                {shiftStatus[p.id]?.shift ? (
                                  <span
                                    className={
                                      shiftStatus[p.id]?.preShift
                                        ? "font-medium text-amber-400"
                                        : "font-medium text-emerald-400"
                                    }
                                  >
                                    {shiftStatus[p.id]?.preShift ? "Get ready for shift" : "Working"}
                                  </span>
                                ) : (
                                  <PresenceInline
                                    userId={p.id}
                                    isOnline={isOnline}
                                    offlineText={`Last seen ${formatLastSeen(p.last_seen_at)}`}
                                    offlineTextClass="text-muted-foreground/70"
                                  />
                                )}
                                {brk && <StaffBreakChip kind={brk.kind} startedAt={brk.started_at} />}
                                <DndCountdown userId={p.id} compact />
                              </div>
                              {p.username && (
                                <div className="text-[11px] text-muted-foreground/70">@{p.username}</div>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {userRoles
                                .filter((r) => STAFF_SET.has(r))
                                .map((r) => (
                                  <span
                                    key={r}
                                    className="text-[10px] uppercase tracking-wider rounded-full ring-1 ring-primary/40 bg-primary/20 text-primary-glow px-2 py-0.5"
                                  >
                                    {formatRoleLabel(r)}
                                  </span>
                                ))}
                            </div>
                            {p.bio && (
                              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{p.bio}</p>
                            )}
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <Link
                                to="/u/$username"
                                params={{ username: p.username ?? p.id }}
                                className="flex items-center justify-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-surface-2/70 border border-border text-foreground hover:border-primary hover:text-primary-glow transition"
                              >
                                <Eye className="size-3.5" /> View profile
                              </Link>
                              <FriendActionMini
                                viewerId={viewer?.id ?? null}
                                targetId={p.id}
                                state={friendByUser[p.id] ?? { kind: "none" }}
                                busy={busyId === p.id || ((friendByUser[p.id]?.kind === "incoming") && busyId === (friendByUser[p.id] as any).id)}
                                onSend={() => sendRequest(p.id)}
                                onAccept={(id) => acceptRequest(id)}
                              />
                            </div>
                            {p.is_private && (
                              <p className="mt-2 text-[10px] text-muted-foreground/70 flex items-center gap-1">
                                <Lock className="size-3" /> Private profile — friends only
                              </p>
                            )}
                            <div className="mt-auto pt-3 border-t border-border">
                              <StaffEmploymentDates joined={employment[p.id]?.join_date} left={employment[p.id]?.leave_date} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </section>
              </TabsContent>
            );
          })}
        </div>
      </div>
    </Tabs>
  );
  }

function FriendActionMini({
  viewerId, targetId, state, busy, onSend, onAccept,
}: {
  viewerId: string | null;
  targetId: string;
  state: FriendState;
  busy: boolean;
  onSend: () => void;
  onAccept: (id: string) => void;
}) {
  if (!viewerId || viewerId === targetId) {
    return <span className="flex items-center justify-center text-[11px] text-muted-foreground/70">—</span>;
  }
  if (state.kind === "friends") {
    return (
      <span className="flex items-center justify-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
        <Check className="size-3.5" /> Friends
      </span>
    );
  }
  if (state.kind === "outgoing") {
    return (
      <span className="flex items-center justify-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-purple-900/60 text-muted-foreground ring-1 ring-purple-500/30">
        <Clock className="size-3.5" /> Pending
      </span>
    );
  }
  if (state.kind === "incoming") {
    return (
      <button
        disabled={busy}
        onClick={() => onAccept(state.id)}
        className="flex items-center justify-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white disabled:opacity-60"
      >
        <Check className="size-3.5" /> Accept
      </button>
    );
  }
  return (
    <button
      disabled={busy}
      onClick={onSend}
      className="flex items-center justify-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-gradient-primary text-primary-foreground disabled:opacity-60"
    >
      <UserPlus className="size-3.5" /> Add friend
    </button>
  );
}
