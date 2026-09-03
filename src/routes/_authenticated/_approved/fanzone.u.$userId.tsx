import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { ArrowLeft, Loader2, MessageSquare, Ban, ShieldOff, Heart, Clock, Quote, UserCheck, UserPlus, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { FanZoneNameGate } from "@/components/app/FanZoneNamePrompt";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import bgAsset from "@/assets/boro-fan-zone-profile-bg.jpg.asset.json";
import { FanStatsBox, FanReputationBox } from "@/components/app/FanZoneStatsBoxes";
import { FanRoleBadge, type FanStaffRole } from "@/components/app/FanRoleBadge";

/** Badge roles in rank order: BM Support first, then Boro Fan Zone. */
const BADGE_ROLES = ["admin", "management", "moderator", "staff", "boro_fan_zone_moderator"] as const;
import { useOnlineUsers } from "@/hooks/use-online-users";
import { useLastSeenMap } from "@/hooks/use-last-seen-map";
import { RelativeTime } from "@/components/app/RelativeTime";

export const Route = createFileRoute("/_authenticated/_approved/fanzone/u/$userId")({
  component: FanProfilePage,
});

type Profile = {
  user_id: string;
  fan_alias: string;
  fan_avatar_url: string;
  bio: string | null;
  supporter_since: number | null;
  fav_player: string | null;
  matchday_memory: string | null;
  joined_at: string;
  is_private: boolean;
  is_blocked_by_me: boolean;
  has_blocked_me: boolean;
};

type FanFriendRel =
  | { kind: "none" }
  | { kind: "outgoing"; id: string }
  | { kind: "friends"; id: string };

type IncomingRel =
  | { kind: "none" }
  | { kind: "pending"; id: string }
  | { kind: "accepted"; id: string };

function FanProfilePage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const canEnter = isStaff || info?.status === "approved";
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [friendRel, setFriendRel] = useState<FanFriendRel>({ kind: "none" });
  const [incomingRel, setIncomingRel] = useState<IncomingRel>({ kind: "none" });
  const [friendBusy, setFriendBusy] = useState(false);
  const [incomingBusy, setIncomingBusy] = useState(false);
  const [fanPrivate, setFanPrivate] = useState(false);
  const [staffRole, setStaffRole] = useState<FanStaffRole | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", [...BADGE_ROLES]);
      const roles = (data ?? []).map((r) => r.role as string);
      // BM Support roles rank above Boro Fan Zone roles.
      setStaffRole((BADGE_ROLES.find((r) => roles.includes(r)) as FanStaffRole) ?? null);
    })();
  }, [userId]);

  const onlineUsers = useOnlineUsers();
  const isOnline = onlineUsers.has(userId);
  const { lastSeen: liveSeen, tick } = useLastSeenMap(useMemo(() => [userId], [userId]));

  useEffect(() => {
    const live = liveSeen[userId];
    if (live !== undefined) setLastSeen(live);
  }, [liveSeen, userId]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_fan_zone_profile", { _user_id: userId });
    setLoading(false);
    if (error) { toast.error("Couldn't load profile", { description: error.message }); return; }
    const row = (data ?? [])[0] as Profile | undefined;
    setP(row ?? null);
    setFanPrivate(!!row?.is_private);
    if (!user?.id || user.id === userId) {
      setFriendRel({ kind: "none" });
      setIncomingRel({ kind: "none" });
      return;
    }
    const { data: mine } = await supabase
      .from("fan_zone_friendships")
      .select("id, status")
      .eq("requester_id", user.id)
      .eq("addressee_id", userId)
      .maybeSingle();
    if (!mine) setFriendRel({ kind: "none" });
    else if (mine.status === "accepted") setFriendRel({ kind: "friends", id: mine.id });
    else setFriendRel({ kind: "outgoing", id: mine.id });

    const { data: theirs } = await supabase
      .from("fan_zone_friendships")
      .select("id, status")
      .eq("requester_id", userId)
      .eq("addressee_id", user.id)
      .maybeSingle();
    if (!theirs) setIncomingRel({ kind: "none" });
    else if (theirs.status === "accepted") setIncomingRel({ kind: "none" });
    else setIncomingRel({ kind: "pending", id: theirs.id });
  };

  useEffect(() => { if (canEnter) void load(); }, [userId, canEnter]);

  if (!canEnter) {
    return <div className="p-6 text-sm text-center">Members only.</div>;
  }

  const startDm = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("get_or_create_fan_dm_thread", { _other: userId });
    setBusy(false);
    if (error) return toast.error("Can't message", { description: error.message });
    navigate({ to: "/fanzone/messages/$thread", params: { thread: data as string } });
  };

  const toggleBlock = async () => {
    if (!p) return;
    setBusy(true);
    const fn = p.is_blocked_by_me ? "fan_zone_unblock" : "fan_zone_block";
    const { error } = await supabase.rpc(fn, { _other: userId });
    setBusy(false);
    if (error) return toast.error("Action failed", { description: error.message });
    toast.success(p.is_blocked_by_me ? "Unblocked" : "Blocked");
    void load();
  };

  const sendFriendRequest = async () => {
    if (!user?.id || friendRel.kind !== "none") return;
    setFriendBusy(true);
    const { error } = await supabase
      .from("fan_zone_friendships")
      .insert({ requester_id: user.id, addressee_id: userId });
    setFriendBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Friend request sent");
    void load();
  };

  const acceptFriendRequest = async () => {
    if (incomingRel.kind !== "pending") return;
    setIncomingBusy(true);
    const { error } = await supabase
      .from("fan_zone_friendships")
      .update({ status: "accepted" })
      .eq("id", incomingRel.id)
      .eq("addressee_id", user?.id ?? "");
    setIncomingBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Friend request accepted");
    void load();
  };

  const isSelf = user?.id === userId;
  const isFriend = friendRel.kind === "friends";
  const mainLocked = fanPrivate && !isSelf && !isStaff && !isFriend;

  return (
    <div
      className="boro-theme relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${bgAsset.url})` }}
    >
      <FanZoneNameGate />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(3, 7, 18, 0.78), rgba(3, 7, 18, 0.72), rgba(3, 7, 18, 0.86))",
        }}
        aria-hidden
      />

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-10 py-8 space-y-4">
      <Button asChild variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10 -ml-2">
        <Link to="/forum"><ArrowLeft className="size-4 mr-1" />Back to forum</Link>
      </Button>

      {loading ? (
        <div className="grid place-items-center py-20 text-white/80"><Loader2 className="size-5 animate-spin" /></div>
      ) : !p ? (
        <div className="rounded-2xl border border-white/20 bg-black/75 backdrop-blur-md p-10 text-center text-white/80 shadow-2xl">This member's fan zone profile is not available.</div>
      ) : mainLocked ? (
        <div className="rounded-2xl border border-white/20 bg-black/75 backdrop-blur-md p-10 text-center text-white/80 shadow-2xl max-w-xl mx-auto">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-white/10">
            <Lock className="size-5 text-amber-300" />
          </div>
          <h2 className="font-display text-xl font-bold text-white mb-2">This profile is private</h2>
          <p className="text-sm text-white/70">
            {p.fan_alias} has chosen to keep their Fan Zone profile private. Send a friend request — once accepted, you'll be able
            to view their full profile.
          </p>
          {!isSelf && friendRel.kind === "none" && incomingRel.kind === "none" && (
            <Button
              className="mt-4 bg-[#E11B22] hover:bg-[#c11419] text-white"
              disabled={friendBusy}
              onClick={sendFriendRequest}
            >
              <UserPlus className="size-4 mr-1.5" />Send friend request
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="rounded-2xl border border-[#E11B22]/45 bg-black/75 backdrop-blur-md shadow-2xl text-white overflow-hidden min-w-0">
          <div className="relative bg-gradient-to-br from-[#E11B22] to-[#8B0F14] px-6 py-8 text-white">
            <div className="flex items-center gap-4">
              <img src={p.fan_avatar_url} alt={p.fan_alias} className="size-20 rounded-full object-cover ring-4 ring-white/20 shadow-lg" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-80">Boro Fan Zone</div>
                <h1 className="font-display text-2xl sm:text-3xl font-black truncate drop-shadow">{p.fan_alias}</h1>
                {staffRole && (
                  <div className="mt-1.5">
                    <FanRoleBadge role={staffRole} />
                  </div>
                )}
                <div className="text-xs opacity-80 mt-1">
                  Member since {new Date(p.joined_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                  {p.supporter_since ? <> · Boro fan since <span className="font-semibold">{p.supporter_since}</span></> : null}
                </div>
                <div
                  key={tick}
                  className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${isOnline ? "bg-emerald-500/25 text-emerald-100" : "bg-black/25 text-white/90"}`}
                >
                  {isOnline ? (
                    <>
                      <span className="size-2 rounded-full bg-emerald-400" />
                      Online now
                    </>
                  ) : (
                    <>
                      <Clock className="size-3" />
                      Away · last active <RelativeTime iso={lastSeen} />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5 text-white">
            {p.has_blocked_me && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                This member has blocked you. You can't message them.
              </div>
            )}
            {p.bio && (
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-white/70 mb-1">Bio</div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{p.bio}</p>
              </div>
            )}
            {p.fav_player && (
              <div className="flex items-start gap-2">
                <Heart className="size-4 text-[#E11B22] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-white/70">Favourite player</div>
                  <p className="text-sm font-medium">{p.fav_player}</p>
                </div>
              </div>
            )}
            {p.matchday_memory && (
              <div className="flex items-start gap-2">
                <Quote className="size-4 text-[#E11B22] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-white/70">Matchday memory</div>
                  <p className="text-sm italic">"{p.matchday_memory}"</p>
                </div>
              </div>
            )}
            {!p.bio && !p.fav_player && !p.matchday_memory && (
              <p className="text-sm text-white/60 italic">No profile info yet.</p>
            )}

            {!isSelf && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                <FanFriendButton
                  rel={friendRel}
                  busy={friendBusy}
                  disabled={p.is_blocked_by_me || p.has_blocked_me}
                  onSend={sendFriendRequest}
                />
                {incomingRel.kind === "pending" && (
                  <Button onClick={() => void acceptFriendRequest()} disabled={incomingBusy || p.is_blocked_by_me || p.has_blocked_me} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">
                    {incomingBusy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <UserCheck className="size-4 mr-1" />}
                    Accept their request
                  </Button>
                )}
                <Button
                  onClick={() => void startDm()}
                  disabled={busy || p.is_blocked_by_me || p.has_blocked_me}
                  className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white"
                >
                  <MessageSquare className="size-4 mr-1" /> Send message
                </Button>
                <Button onClick={() => void toggleBlock()} variant="outline" disabled={busy} className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white">
                  {p.is_blocked_by_me ? <><ShieldOff className="size-4 mr-1" /> Unblock</> : <><Ban className="size-4 mr-1" /> Block</>}
                </Button>
              </div>
            )}
          </div>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6 self-start">
          <FanStatsBox userId={userId} />
          <FanReputationBox userId={userId} />
        </aside>
        </div>
      )}
      </div>
    </div>
  );
}

function FanFriendButton({
  rel,
  busy,
  disabled,
  onSend,
}: {
  rel: FanFriendRel;
  busy: boolean;
  disabled: boolean;
  onSend: () => void;
}) {
  if (rel.kind === "friends") {
    return (
      <Button disabled variant="outline" className="bg-emerald-500/15 border-emerald-400/40 text-emerald-100 opacity-100">
        <UserCheck className="size-4 mr-1" /> Friends
      </Button>
    );
  }

  if (rel.kind === "outgoing") {
    return (
      <Button disabled variant="outline" className="bg-amber-500/15 border-amber-400/40 text-amber-100 opacity-100">
        <Clock className="size-4 mr-1" /> Request pending
      </Button>
    );
  }

  return (
    <Button onClick={() => void onSend()} disabled={busy || disabled} variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white">
      {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <UserPlus className="size-4 mr-1" />}
      Add friend
    </Button>
  );
}