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
import { useBusinessOpen } from "@/hooks/use-business-open";
import { formatLastSeen } from "@/lib/relative-time";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { VpnBadge } from "@/lib/vpn-flags";

export const Route = createFileRoute("/_authenticated/_approved/staff")({
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
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrators",
  management: "Management",
  moderator: "Moderators",
  staff: "Staff",
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
  const businessOpen = useBusinessOpen();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});
  const [friendByUser, setFriendByUser] = useState<Record<string, FriendState>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = async () => {
    const [{ data: ps }, { data: rs }] = await Promise.all([
      supabase.from("profiles").select("*").order("display_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setProfiles((ps as Profile[] | null) ?? []);
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
        if (f.status === "accepted") fmap[otherId] = { kind: "friends", id: f.id };
        else if (f.requester_id === viewer.id) fmap[otherId] = { kind: "outgoing" };
        else fmap[otherId] = { kind: "incoming", id: f.id };
      }
      setFriendByUser(fmap);
    }
  };
  useEffect(() => { load(); }, [viewer?.id]);

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
    (rolesByUser[p.id] ?? []).some((r) => STAFF_SET.has(r))
  );
  const filtered = staffProfiles.filter((p) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      (p.display_name ?? "").toLowerCase().includes(s) ||
      (p.username ?? "").toLowerCase().includes(s)
    );
  });

  // Highest role per user (by ROLE_ORDER priority)
  const topRole = (uid: string): string => {
    const rs = rolesByUser[uid] ?? [];
    for (const r of ROLE_ORDER) if (rs.includes(r)) return r;
    return "staff";
  };

  const grouped: Record<string, Profile[]> = {};
  ROLE_ORDER.forEach((r) => (grouped[r] = []));
  filtered.forEach((p) => grouped[topRole(p.id)].push(p));

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-violet-950 via-fuchsia-950 to-blue-950">
      <header className="px-8 pt-8 pb-6 border-b border-purple-500/30 bg-purple-950/40 backdrop-blur flex items-center gap-3">
        <div className="size-11 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center text-white shadow-lg shadow-purple-900/50">
          <Briefcase className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">
            Staff Directory
          </h1>
          <p className="text-purple-200/80 mt-1">The people running the show — grouped by role.</p>
        </div>
      </header>

      <div className="px-8 py-6">
        <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-purple-300" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search staff…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-purple-950/50 border border-purple-500/30 text-purple-50 placeholder:text-purple-300/50 outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/40"
            />
          </div>

        <Tabs defaultValue="admin" className="mt-6">
          <TabsList className="bg-purple-950/50 border border-purple-500/30 h-auto p-1 flex-wrap">
            {ROLE_ORDER.map((role) => (
              <TabsTrigger
                key={role}
                value={role}
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-fuchsia-600 data-[state=active]:text-white text-purple-200"
              >
                {ROLE_LABEL[role]}
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900/70 border border-purple-400/30">
                  {grouped[role].length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {ROLE_ORDER.map((role) => {
            const list = grouped[role];
            return (
              <TabsContent key={role} value={role} className="mt-6">
                <section>
                  <div
                    className="relative mb-4 h-32 sm:h-40 rounded-2xl overflow-hidden border border-purple-500/30 bg-cover bg-center"
                    style={{ backgroundImage: `url(${ROLE_HEADER[role]})` }}
                    aria-hidden
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-950/90 via-purple-950/40 to-transparent" />
                    <div className="absolute inset-0 flex items-center gap-3 px-5">
                      <h2 className="font-display text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                        {ROLE_LABEL[role]}
                      </h2>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/70 text-purple-100 border border-purple-400/40 backdrop-blur">
                        {list.length}
                      </span>
                    </div>
                  </div>

                  {list.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-purple-500/40 p-12 text-center text-purple-200/70 bg-purple-950/30">
                      No {ROLE_LABEL[role].toLowerCase()} found.
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {list.map((p) => {
                      const name = p.display_name ?? p.username ?? "Unknown";
                      const initial = name.slice(0, 1).toUpperCase();
                      const userRoles = rolesByUser[p.id] ?? [];
                      const isOnline = onlineUsers.has(p.id);
                      const isAway = isOnline && !businessOpen;
                      const statusLabel = isAway
                        ? "Away From The Office"
                        : isOnline
                          ? "Online"
                          : "Offline";
                      const dotClass = isAway
                        ? "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)]"
                        : isOnline
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]"
                          : "bg-zinc-500";
                      const smallDot = isAway
                        ? "bg-yellow-400"
                        : isOnline
                          ? "bg-emerald-500"
                          : "bg-zinc-500";
                      const textClass = isAway
                        ? "text-yellow-300"
                        : isOnline
                          ? "text-emerald-300"
                          : "text-purple-300/70";
                      return (
                        <div
                          key={p.id}
                          className="group rounded-2xl bg-purple-950/50 border border-purple-500/30 hover:border-fuchsia-400/70 hover:shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-all overflow-hidden flex flex-col backdrop-blur"
                        >
                          <div
                            className="h-16 bg-cover bg-center"
                            style={{ backgroundImage: `url(${ROLE_HEADER[role] ?? profileHeader})` }}
                            aria-hidden
                          />
                          <div className="px-4 -mt-8 pb-4 flex flex-col flex-1">
                            <div className="relative w-fit">
                              {p.avatar_url ? (
                                <img
                                  src={p.avatar_url}
                                  alt=""
                                  className="size-16 rounded-2xl object-cover ring-4 ring-purple-950"
                                />
                              ) : (
                                <div className="size-16 rounded-2xl ring-4 ring-purple-950 bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center text-white text-xl font-bold">
                                  {initial}
                                </div>
                              )}
                              <span
                                title={statusLabel}
                                aria-label={statusLabel}
                                className={`absolute -bottom-0.5 -right-0.5 size-4 rounded-full ring-2 ring-purple-950 ${dotClass}`}
                              />
                            </div>
                            <div className="mt-3">
                              <Link
                                to="/u/$username"
                                params={{ username: p.username ?? p.id }}
                                className="font-semibold text-sm text-purple-50 hover:text-fuchsia-300 transition-colors"
                              >
                                {name}
                              </Link>
                              <span className="ml-1 inline-flex align-middle"><VpnBadge userId={p.id} size={12} /></span>
                              <div className="text-[10px] mt-0.5 flex items-center gap-1.5">
                                <span className={`size-1.5 rounded-full ${smallDot}`} />
                                <span className={textClass}>
                                  {isAway
                                    ? "Away From The Office"
                                    : isOnline
                                      ? "Online"
                                      : `Last seen ${formatLastSeen(p.last_seen_at)}`}
                                </span>
                              </div>
                              {p.username && (
                                <div className="text-[11px] text-purple-300/70">@{p.username}</div>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {userRoles
                                .filter((r) => STAFF_SET.has(r))
                                .map((r) => (
                                  <span
                                    key={r}
                                    className="text-[10px] uppercase tracking-wider rounded-full ring-1 ring-fuchsia-400/40 bg-fuchsia-500/20 text-fuchsia-200 px-2 py-0.5"
                                  >
                                    {r}
                                  </span>
                                ))}
                            </div>
                            {p.bio && (
                              <p className="text-xs text-purple-200/70 mt-2 line-clamp-2">{p.bio}</p>
                            )}
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <Link
                                to="/u/$username"
                                params={{ username: p.username ?? p.id }}
                                className="flex items-center justify-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-purple-900/60 border border-purple-500/30 text-purple-100 hover:border-fuchsia-400 hover:text-fuchsia-200 transition"
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
                              <p className="mt-2 text-[10px] text-purple-300/70 flex items-center gap-1">
                                <Lock className="size-3" /> Private profile — friends only
                              </p>
                            )}
                            <div className="mt-auto pt-3 border-t border-purple-500/20 text-[11px] text-purple-300/70 flex items-center gap-1.5">
                              <Clock className="size-3" />
                              Joined {new Date(p.created_at).toLocaleDateString()}
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
        </Tabs>
        </div>
      </div>
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
    return <span className="flex items-center justify-center text-[11px] text-purple-300/70">—</span>;
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
      <span className="flex items-center justify-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-purple-900/60 text-purple-200/80 ring-1 ring-purple-500/30">
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
      className="flex items-center justify-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white disabled:opacity-60"
    >
      <UserPlus className="size-3.5" /> Add friend
    </button>
  );
}
