import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, Save, UserMinus, ShieldOff, ThumbsUp, ThumbsDown, MessageSquare, FileText, Users, Award, Lock, Clock } from "lucide-react";
import { RelativeTime } from "@/components/app/RelativeTime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { notifyFanAliasChange } from "@/lib/fan-alias-bus";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { toast } from "sonner";
import boroDefaultAvatar from "@/assets/boro-default-avatar.png";
import bgAsset from "@/assets/boro-fan-zone-profile-bg.jpg.asset.json";
import { useFanAvatarLock } from "@/lib/fan-avatar-lock";

export const Route = createFileRoute("/_authenticated/_approved/fanzone/profile")({
  component: FanZoneProfilePage,
});

function FanZoneProfilePage() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const { locked: avatarLocked, forcedAvatar, lockMessage } = useFanAvatarLock();
  const info = useFanZoneMembership(user?.id ?? null);
  const [alias, setAlias] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [supporterSince, setSupporterSince] = useState("");
  const [favPlayer, setFavPlayer] = useState("");
  const [memory, setMemory] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [myLastSeen, setMyLastSeen] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      const { data } = await supabase.from("profiles").select("last_seen_at").eq("id", user.id).maybeSingle();
      setMyLastSeen((data as { last_seen_at: string | null } | null)?.last_seen_at ?? null);
    })();
  }, [user?.id]);

  useEffect(() => {
    setAlias(info?.fanAlias ?? "");
    setAvatarUrl(forcedAvatar ?? info?.fanAvatarUrl ?? "");
    setBio(info?.bio ?? "");
    setSupporterSince(info?.supporterSince ? String(info.supporterSince) : "");
    setFavPlayer(info?.favPlayer ?? "");
    setMemory(info?.matchdayMemory ?? "");
  }, [info?.fanAlias, info?.fanAvatarUrl, info?.bio, info?.supporterSince, info?.favPlayer, info?.matchdayMemory, forcedAvatar]);

  const canEdit = !!user && (isStaff || info?.status === "approved");
  const hasAlias = !!(info?.fanAlias || info?.fanAvatarUrl);
  const editPreviewAvatar = forcedAvatar || avatarUrl || boroDefaultAvatar;

  const onPickFile = async (file: File) => {
    if (!user) return;
    if (avatarLocked) return toast.error(lockMessage);
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5MB");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${user.id}/fanzone-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const a = alias.trim();
    if (a.length > 64) return toast.error("Alias too long (max 64)");
    const sinceNum = supporterSince.trim() ? parseInt(supporterSince.trim(), 10) : null;
    if (sinceNum !== null && (Number.isNaN(sinceNum) || sinceNum < 1876 || sinceNum > new Date().getFullYear())) {
      return toast.error("Supporter-since year looks wrong");
    }
    setSaving(true);
    const { error } = await supabase.rpc("set_my_fan_profile", {
      _alias: a,
      _avatar: avatarUrl.trim(),
      _bio: bio.trim(),
      _supporter_since: sinceNum as number,
      _fav_player: favPlayer.trim(),
      _matchday_memory: memory.trim(),
    } as never);
    setSaving(false);
    if (error) return toast.error("Couldn't save", { description: error.message });
    notifyFanAliasChange();
    toast.success("Fan zone identity updated");
  };

  const clear = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("set_my_fan_profile", {
      _alias: "", _avatar: "", _bio: "", _supporter_since: null as unknown as number, _fav_player: "", _matchday_memory: "",
    } as never);
    setSaving(false);
    if (error) return toast.error("Couldn't clear", { description: error.message });
    setAlias(""); setAvatarUrl(""); setBio(""); setSupporterSince(""); setFavPlayer(""); setMemory("");
    notifyFanAliasChange();
    toast.success("Reverted to your main profile");
  };

  return (
    <div
      className="boro-theme relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${bgAsset.url})` }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(3, 7, 18, 0.78), rgba(3, 7, 18, 0.72), rgba(3, 7, 18, 0.86))",
        }}
        aria-hidden
      />

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-10 py-8">
        <Button asChild variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10 -ml-2 mb-4">
          <Link to="/forum"><ArrowLeft className="size-4 mr-1" />Back to forum</Link>
        </Button>

        <div className="mb-6 text-white">
          <div className="text-[11px] uppercase tracking-[0.25em] font-bold text-[#E11B22]">Boro Fan Zone</div>
          <h1 className="font-display text-3xl sm:text-4xl font-black drop-shadow-lg">Your fan profile</h1>
          <p className="text-sm text-white/80 mt-2 max-w-xl">
            This is how other Boro fans see you inside the fan zone. Set an alias, picture, and a bit about your support.
          </p>
        </div>

        {!canEdit ? (
          <div className="rounded-2xl border border-white/20 bg-black/75 backdrop-blur-md p-8 text-center text-white/80 shadow-2xl">
            Fan Zone membership required to edit your profile.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Tabs defaultValue="profile" className="w-full min-w-0">
            <TabsList className="bg-black/55 border border-white/20 backdrop-blur-md mb-4">
              <TabsTrigger value="profile" className="data-[state=active]:bg-[#E11B22] data-[state=active]:text-white text-white/70">Profile</TabsTrigger>
              <TabsTrigger value="friends" className="data-[state=active]:bg-[#E11B22] data-[state=active]:text-white text-white/70">Friends</TabsTrigger>
              <TabsTrigger value="ignored" className="data-[state=active]:bg-[#E11B22] data-[state=active]:text-white text-white/70">Ignored</TabsTrigger>
              <TabsTrigger value="privacy" className="data-[state=active]:bg-[#E11B22] data-[state=active]:text-white text-white/70">Privacy</TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <div className="rounded-2xl border border-[#E11B22]/45 bg-black/75 backdrop-blur-md shadow-2xl text-white overflow-hidden">
            <div className="flex items-center gap-4 px-5 sm:px-6 py-5 bg-gradient-to-r from-[#E11B22]/30 to-transparent border-b border-white/10">
              <div className="size-20 rounded-full overflow-hidden bg-gradient-to-br from-[#E11B22] to-[#8B0F14] ring-4 ring-white/15 shrink-0">
                <img src={editPreviewAvatar} alt="" className="size-20 object-cover" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-medium text-white/90 ring-1 ring-white/15">
                  <Clock className="size-3" />
                  Last active <RelativeTime iso={myLastSeen} />
                </div>
                <div className="flex flex-wrap gap-2">
                {avatarLocked ? (
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-[#E11B22]/20 px-3 py-1 text-[11px] font-semibold text-white ring-1 ring-[#E11B22]/50">
                    <Lock className="size-3.5" />
                    {lockMessage}
                  </p>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                      {uploading ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <ImagePlus className="size-3.5 mr-1.5" />}
                      {avatarUrl ? "Replace picture" : "Upload picture"}
                    </Button>
                    {avatarUrl && (
                      <Button size="sm" variant="ghost" onClick={() => setAvatarUrl("")} className="text-white/80 hover:text-white hover:bg-white/10">
                        Remove
                      </Button>
                    )}
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onPickFile(f);
                    e.target.value = "";
                  }}
                />
                </div>
              </div>
            </div>

            <div className="px-5 sm:px-6 py-5 space-y-5">
              <div>
                <label className="text-[11px] uppercase tracking-wider font-semibold text-white/70">
                  Display name (Boro Fan Zone only)
                </label>
                <Input
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="e.g. Ayresome Ayatollah"
                  maxLength={64}
                  className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                />
                <p className="text-[11px] text-white/60 mt-1.5">
                  Shown on your posts and topics inside the fan zone. Leave blank to use your normal profile name.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider font-semibold text-white/70">Supporter since</label>
                  <Input
                    value={supporterSince}
                    onChange={(e) => setSupporterSince(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                    placeholder="e.g. 1986"
                    inputMode="numeric"
                    maxLength={4}
                    className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider font-semibold text-white/70">Favourite player</label>
                  <Input
                    value={favPlayer}
                    onChange={(e) => setFavPlayer(e.target.value.slice(0, 80))}
                    placeholder="e.g. Juninho"
                    maxLength={80}
                    className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider font-semibold text-white/70">Bio</label>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 500))}
                  placeholder="Tell other Boro fans a bit about yourself"
                  maxLength={500}
                  rows={4}
                  className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider font-semibold text-white/70">Favourite matchday memory</label>
                <Textarea
                  value={memory}
                  onChange={(e) => setMemory(e.target.value.slice(0, 280))}
                  placeholder="e.g. The night we beat Steaua"
                  maxLength={280}
                  rows={3}
                  className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                />
              </div>

              <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-white/10">
                {hasAlias && (
                  <Button size="sm" variant="ghost" onClick={() => void clear()} disabled={saving} className="text-white/80 hover:text-white hover:bg-white/10">
                    Clear alias
                  </Button>
                )}
                <Button
                  onClick={() => void save()}
                  disabled={saving}
                  className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white"
                >
                  {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Save className="size-4 mr-1.5" />}
                  Save profile
                </Button>
              </div>
            </div>
              </div>
            </TabsContent>

            <TabsContent value="friends">
              <FriendsPanel userId={user!.id} />
            </TabsContent>

            <TabsContent value="ignored">
              <IgnoredPanel />
            </TabsContent>

            <TabsContent value="privacy">
              <PrivacyPanel userId={user!.id} />
            </TabsContent>
            </Tabs>
            <aside className="space-y-4 lg:sticky lg:top-6 self-start">
              <StatsBox userId={user!.id} />
              <ReputationBox userId={user!.id} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

type FriendRow = { user_id: string; fan_alias: string | null; fan_avatar_url: string | null; friendship_id: string };

function PrivacyPanel({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("fan_zone_privacy", { _ids: [userId] });
      if (cancelled) return;
      setIsPrivate(!!(data ?? [])[0]?.is_private);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const update = async (next: boolean) => {
    setSaving(true);
    const { error } = await supabase.rpc("fan_zone_set_privacy", { _private: next });
    setSaving(false);
    if (error) return toast.error("Couldn't update privacy", { description: error.message });
    setIsPrivate(next);
    notifyFanAliasChange();
    toast.success(next ? "Your Fan Zone profile is now private" : "Your Fan Zone profile is now visible to members");
  };

  return (
    <div className="rounded-2xl border border-[#E11B22]/40 bg-black/35 backdrop-blur-md shadow-2xl text-white p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold mb-1 flex items-center gap-2"><Lock className="size-4 text-[#E11B22]" />Privacy</h2>
      <p className="text-sm text-white/70 mb-4">
        Control who can view your Boro Fan Zone profile. This is separate from your BM Support profile privacy.
      </p>
      {loading ? (
        <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-white/70" /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Private Fan Zone profile</div>
              <p className="text-xs text-white/60 mt-1">
                When on, only you, your friends and admins can view your profile. Other fans see a “Private profile” notice
                and can send you a friend request.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPrivate}
              disabled={saving}
              onClick={() => void update(!isPrivate)}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${isPrivate ? "bg-[#E11B22]" : "bg-white/25"} disabled:opacity-60`}
            >
              <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${isPrivate ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          <p className="text-[11px] text-white/50">
            Your fan zone posts and alias stay visible either way — only your Fan Zone profile page is restricted. Your BM
            Support profile has its own separate privacy setting.
          </p>
        </div>
      )}
    </div>
  );
}

type FanRequestRow = FriendRow & { direction: "incoming" | "outgoing" };

function FriendsPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<FriendRow[] | null>(null);
  const [requests, setRequests] = useState<FanRequestRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data: all } = await supabase
      .from("fan_zone_friendships")
      .select("id, requester_id, addressee_id, status")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    const rowsAll = all ?? [];
    const list = rowsAll.filter((f: any) => f.status === "accepted" && f.requester_id === userId);
    const pending = rowsAll.filter((f: any) => f.status !== "accepted");
    const ids = Array.from(
      new Set(rowsAll.map((f: any) => (f.requester_id === userId ? f.addressee_id : f.requester_id))),
    );
    if (ids.length === 0) { setRows([]); setRequests([]); return; }
    // Direct reads of other members' rows are restricted, so use the safe alias lookup.
    const { data: members } = await supabase.rpc("fan_zone_aliases", { _ids: ids });
    const byId = new Map(((members as any[]) ?? []).map((m: any) => [m.user_id, m]));
    const shape = (f: any): FriendRow => {
      const otherId = f.requester_id === userId ? f.addressee_id : f.requester_id;
      const m = byId.get(otherId) as any;
      return { user_id: otherId, fan_alias: m?.fan_alias ?? null, fan_avatar_url: m?.fan_avatar_url ?? null, friendship_id: f.id };
    };
    setRows(list.map(shape));
    setRequests(
      pending.map((f: any) => ({
        ...shape(f),
        direction: f.addressee_id === userId ? ("incoming" as const) : ("outgoing" as const),
      })),
    );
  };
  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`fanzone-friends-panel:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fan_zone_friendships" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const accept = async (friendshipId: string) => {
    setBusy(friendshipId);
    const { error } = await supabase
      .from("fan_zone_friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId)
      .eq("addressee_id", userId);
    setBusy(null);
    if (error) return toast.error("Couldn't accept", { description: error.message });
    toast.success("Friend request accepted");
    void load();
  };


  const remove = async (friendshipId: string) => {
    setBusy(friendshipId);
    const { error } = await supabase.from("fan_zone_friendships").delete().eq("id", friendshipId);
    setBusy(null);
    if (error) return toast.error("Couldn't remove friend", { description: error.message });
    notifyFanAliasChange();
    toast.success("Friend removed");
    void load();
  };

  return (
    <div className="rounded-2xl border border-[#E11B22]/40 bg-black/35 backdrop-blur-md shadow-2xl text-white p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold mb-1">Friends</h2>
      <p className="text-sm text-white/70 mb-4">Your Boro Fan Zone friends. This list is separate from your BM Support friends.</p>
      {requests.length > 0 && (
        <div className="mb-5 space-y-2">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-white/70">Friend requests</div>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.friendship_id} className="flex items-center gap-3 rounded-xl border border-[#E11B22]/40 bg-[#E11B22]/10 p-3">
                <img src={r.fan_avatar_url || boroDefaultAvatar} alt="" className="size-10 rounded-full object-cover ring-2 ring-white/10" />
                <div className="flex-1 min-w-0">
                  <Link to="/fanzone/u/$userId" params={{ userId: r.user_id }} className="font-semibold text-sm truncate hover:underline block">
                    {r.fan_alias || "Boro fan"}
                  </Link>
                  <div className="text-[11px] text-white/60">{r.direction === "incoming" ? "Wants to be your friend" : "Request sent — awaiting reply"}</div>
                </div>
                {r.direction === "incoming" ? (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy === r.friendship_id} onClick={() => void accept(r.friendship_id)} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">
                      {busy === r.friendship_id ? <Loader2 className="size-4 animate-spin" /> : "Accept"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === r.friendship_id} onClick={() => void remove(r.friendship_id)} className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                      Decline
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy === r.friendship_id} onClick={() => void remove(r.friendship_id)} className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows === null ? (
        <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin text-white/70" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 p-8 text-center text-sm text-white/60">You have no friends yet. Visit a fan's profile to add them.</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.friendship_id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <img src={r.fan_avatar_url || boroDefaultAvatar} alt="" className="size-10 rounded-full object-cover ring-2 ring-white/10" />
              <Link to="/fanzone/u/$userId" params={{ userId: r.user_id }} className="flex-1 min-w-0 font-semibold text-sm truncate hover:underline">
                {r.fan_alias || "Boro fan"}
              </Link>
              <Button size="sm" variant="outline" disabled={busy === r.friendship_id} onClick={() => void remove(r.friendship_id)} className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                {busy === r.friendship_id ? <Loader2 className="size-4 mr-1 animate-spin" /> : <UserMinus className="size-4 mr-1" />}
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type IgnoreRow = { blocked_id: string; fan_alias: string; fan_avatar_url: string; created_at: string };

type Stats = { topics: number; posts: number; friends: number; reactionsReceived: number; likes: number; dislikes: number };

function StatsBox({ userId }: { userId: string }) {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [topicsRes, postsRes, friendsRes, postIdsRes] = await Promise.all([
        supabase.from("forum_topics").select("id", { count: "exact", head: true }).eq("author_id", userId),
        supabase.from("forum_posts").select("id", { count: "exact", head: true }).eq("author_id", userId),
        supabase.from("fan_zone_friendships").select("id", { count: "exact", head: true }).eq("status", "accepted").eq("requester_id", userId),
        supabase.from("forum_posts").select("id").eq("author_id", userId),
      ]);
      const postIds = (postIdsRes.data ?? []).map((p: any) => p.id);
      let likes = 0, dislikes = 0, total = 0;
      if (postIds.length) {
        // Your own reactions on your own posts don't count towards reputation.
        const { data: rx } = await supabase
          .from("forum_post_reactions")
          .select("emoji, user_id")
          .in("post_id", postIds)
          .neq("user_id", userId);
        for (const r of rx ?? []) {
          total++;
          if ((r as any).emoji === "👎") dislikes++; else likes++;
        }
      }
      if (cancelled) return;
      setS({
        topics: topicsRes.count ?? 0,
        posts: postsRes.count ?? 0,
        friends: friendsRes.count ?? 0,
        reactionsReceived: total,
        likes,
        dislikes,
      });
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const Item = ({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) => (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <Icon className="size-4 text-[#E11B22]" />
      <div className="text-xs text-white/70 flex-1">{label}</div>
      <div className="font-display text-lg font-black tabular-nums">{value}</div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-[#E11B22]/40 bg-black/35 backdrop-blur-md shadow-2xl text-white p-5">
      <h2 className="font-display text-lg font-bold mb-3 flex items-center gap-2"><Award className="size-4 text-[#E11B22]" />Fan stats</h2>
      {!s ? (
        <div className="grid place-items-center py-8"><Loader2 className="size-4 animate-spin text-white/70" /></div>
      ) : (
        <div className="space-y-2">
          <Item icon={FileText} label="Topics started" value={s.topics} />
          <Item icon={MessageSquare} label="Forum posts" value={s.posts} />
          <Item icon={Users} label="Friends" value={s.friends} />
          
        </div>
      )}
    </div>
  );
}

function ReputationBox({ userId }: { userId: string }) {
  const [data, setData] = useState<{ score: number; likes: number; dislikes: number; topFans: Array<{ user_id: string; alias: string | null; avatar: string | null; count: number }> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: posts } = await supabase.from("forum_posts").select("id").eq("author_id", userId);
      const ids = (posts ?? []).map((p: any) => p.id);
      if (ids.length === 0) { if (!cancelled) setData({ score: 0, likes: 0, dislikes: 0, topFans: [] }); return; }
      const { data: rx } = await supabase.from("forum_post_reactions").select("user_id, emoji").in("post_id", ids);
      let likes = 0, dislikes = 0;
      const tally = new Map<string, number>();
      for (const r of (rx ?? []) as any[]) {
        if (r.user_id === userId) continue;
        if (r.emoji === "👎") { dislikes++; tally.set(r.user_id, (tally.get(r.user_id) ?? 0) - 1); }
        else { likes++; tally.set(r.user_id, (tally.get(r.user_id) ?? 0) + 1); }
      }
      const top = [...tally.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);
      const fanIds = top.map(([id]) => id);
      let members: any[] = [];
      if (fanIds.length) {
        const { data: m } = await supabase.rpc("fan_zone_aliases", { _ids: fanIds });
        members = (m as any[]) ?? [];
      }
      const byId = new Map(members.map((m: any) => [m.user_id, m]));
      const topFans = top.map(([id, count]) => {
        const m = byId.get(id);
        return { user_id: id, alias: m?.fan_alias ?? null, avatar: m?.fan_avatar_url ?? null, count };
      });
      if (cancelled) return;
      setData({ score: likes - dislikes, likes, dislikes, topFans });
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div className="rounded-2xl border border-[#E11B22]/40 bg-black/35 backdrop-blur-md shadow-2xl text-white p-5">
      <h2 className="font-display text-lg font-bold mb-1 flex items-center gap-2"><Award className="size-4 text-[#E11B22]" />Reputation</h2>
      <p className="text-[11px] text-white/60 mb-3">Based on reactions to your forum posts.</p>
      {!data ? (
        <div className="grid place-items-center py-8"><Loader2 className="size-4 animate-spin text-white/70" /></div>
      ) : (
        <>
          <div className="rounded-xl border border-white/10 bg-gradient-to-r from-[#E11B22]/20 to-transparent p-4 mb-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-white/60">Score</div>
            <div className={`font-display text-4xl font-black tabular-nums ${data.score >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {data.score > 0 ? `+${data.score}` : data.score}
            </div>
            <div className="flex items-center justify-center gap-4 mt-2 text-xs">
              <span className="flex items-center gap-1 text-emerald-300"><ThumbsUp className="size-3" />{data.likes}</span>
              <span className="flex items-center gap-1 text-rose-300"><ThumbsDown className="size-3" />{data.dislikes}</span>
            </div>
          </div>
          <div className="text-[11px] uppercase tracking-wider text-white/60 mb-2">Top reactors</div>
          {data.topFans.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 p-4 text-center text-xs text-white/50">No reactions yet.</div>
          ) : (
            <ul className="space-y-1.5">
              {data.topFans.map((f) => (
                <li key={f.user_id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
                  <img src={f.avatar || boroDefaultAvatar} alt="" className="size-7 rounded-full object-cover ring-1 ring-white/10" />
                  <Link to="/fanzone/u/$userId" params={{ userId: f.user_id }} className="flex-1 min-w-0 text-xs font-semibold truncate hover:underline">
                    {f.alias || "Boro fan"}
                  </Link>
                  <span className={`text-xs font-bold tabular-nums ${f.count >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {f.count > 0 ? `+${f.count}` : f.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function IgnoredPanel() {
  const [rows, setRows] = useState<IgnoreRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.rpc("list_my_fan_blocks");
    setRows((data ?? []) as IgnoreRow[]);
  };
  useEffect(() => { void load(); }, []);

  const unblock = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.rpc("fan_zone_unblock", { _other: id });
    setBusy(null);
    if (error) return toast.error("Couldn't unblock", { description: error.message });
    notifyFanAliasChange();
    toast.success("Unblocked");
    void load();
  };

  return (
    <div className="rounded-2xl border border-[#E11B22]/40 bg-black/35 backdrop-blur-md shadow-2xl text-white p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold mb-1">Ignored members</h2>
      <p className="text-sm text-white/70 mb-4">Members you've blocked. Their posts and DMs are hidden from you.</p>
      {rows === null ? (
        <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin text-white/70" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 p-8 text-center text-sm text-white/60">You haven't ignored anyone.</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.blocked_id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <Link to="/fanzone/u/$userId" params={{ userId: r.blocked_id }} className="shrink-0">
                <img src={r.fan_avatar_url || boroDefaultAvatar} alt="" className="size-10 rounded-full object-cover ring-2 ring-white/10" />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to="/fanzone/u/$userId" params={{ userId: r.blocked_id }} className="block font-semibold text-sm truncate hover:text-[#E11B22] hover:underline">{r.fan_alias || "Boro fan"}</Link>
                <div className="text-[11px] text-white/60">Ignored {new Date(r.created_at).toLocaleDateString("en-GB")}</div>
              </div>
              <Button size="sm" variant="outline" disabled={busy === r.blocked_id} onClick={() => void unblock(r.blocked_id)} className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                {busy === r.blocked_id ? <Loader2 className="size-4 mr-1 animate-spin" /> : <ShieldOff className="size-4 mr-1" />}
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}