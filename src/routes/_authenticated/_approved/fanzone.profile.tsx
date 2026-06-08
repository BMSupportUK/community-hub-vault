import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, Save, UserMinus, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { toast } from "sonner";
import boroDefaultAvatar from "@/assets/boro-default-avatar.png";
import bgAsset from "@/assets/boro-fan-zone-profile-bg.jpg.asset.json";

export const Route = createFileRoute("/_authenticated/_approved/fanzone/profile")({
  component: FanZoneProfilePage,
});

function FanZoneProfilePage() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
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

  useEffect(() => {
    setAlias(info?.fanAlias ?? "");
    setAvatarUrl(info?.fanAvatarUrl ?? "");
    setBio(info?.bio ?? "");
    setSupporterSince(info?.supporterSince ? String(info.supporterSince) : "");
    setFavPlayer(info?.favPlayer ?? "");
    setMemory(info?.matchdayMemory ?? "");
  }, [info?.fanAlias, info?.fanAvatarUrl, info?.bio, info?.supporterSince, info?.favPlayer, info?.matchdayMemory]);

  const canEdit = !!user && (isStaff || info?.status === "approved");
  const hasAlias = !!(info?.fanAlias || info?.fanAvatarUrl);
  const editPreviewAvatar = avatarUrl || boroDefaultAvatar;

  const onPickFile = async (file: File) => {
    if (!user) return;
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
    toast.success("Reverted to your main profile");
  };

  return (
    <div
      className="boro-theme relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${bgAsset.url})` }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/85" aria-hidden />

      <div className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8">
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
          <div className="rounded-2xl border border-white/20 bg-black/50 backdrop-blur-md p-8 text-center text-white/80">
            Fan Zone membership required to edit your profile.
          </div>
        ) : (
          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="bg-black/55 border border-white/20 backdrop-blur-md mb-4">
              <TabsTrigger value="profile" className="data-[state=active]:bg-[#E11B22] data-[state=active]:text-white text-white/70">Profile</TabsTrigger>
              <TabsTrigger value="friends" className="data-[state=active]:bg-[#E11B22] data-[state=active]:text-white text-white/70">Friends</TabsTrigger>
              <TabsTrigger value="ignored" className="data-[state=active]:bg-[#E11B22] data-[state=active]:text-white text-white/70">Ignored</TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <div className="rounded-2xl border border-[#E11B22]/40 bg-black/55 backdrop-blur-md shadow-2xl text-white overflow-hidden">
            <div className="flex items-center gap-4 px-5 sm:px-6 py-5 bg-gradient-to-r from-[#E11B22]/30 to-transparent border-b border-white/10">
              <div className="size-20 rounded-full overflow-hidden bg-gradient-to-br from-[#E11B22] to-[#8B0F14] ring-4 ring-white/15 shrink-0">
                <img src={editPreviewAvatar} alt="" className="size-20 object-cover" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                  {uploading ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <ImagePlus className="size-3.5 mr-1.5" />}
                  {avatarUrl ? "Replace picture" : "Upload picture"}
                </Button>
                {avatarUrl && (
                  <Button size="sm" variant="ghost" onClick={() => setAvatarUrl("")} className="text-white/80 hover:text-white hover:bg-white/10">
                    Remove
                  </Button>
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
          </Tabs>
        )}
      </div>
    </div>
  );
}

type FriendRow = { user_id: string; fan_alias: string | null; fan_avatar_url: string | null; friendship_id: string };

function FriendsPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<FriendRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data: friends } = await supabase
      .from("fan_zone_friendships")
      .select("id, requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    const list = friends ?? [];
    const ids = list.map((f: any) => (f.requester_id === userId ? f.addressee_id : f.requester_id));
    if (ids.length === 0) { setRows([]); return; }
    const { data: members } = await supabase
      .from("fan_zone_members")
      .select("user_id, fan_alias, fan_avatar_url")
      .in("user_id", ids);
    const byId = new Map((members ?? []).map((m: any) => [m.user_id, m]));
    setRows(list.map((f: any) => {
      const otherId = f.requester_id === userId ? f.addressee_id : f.requester_id;
      const m = byId.get(otherId) as any;
      return { user_id: otherId, fan_alias: m?.fan_alias ?? null, fan_avatar_url: m?.fan_avatar_url ?? null, friendship_id: f.id };
    }));
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [userId]);

  const remove = async (friendshipId: string) => {
    setBusy(friendshipId);
    const { error } = await supabase.from("fan_zone_friendships").delete().eq("id", friendshipId);
    setBusy(null);
    if (error) return toast.error("Couldn't remove friend", { description: error.message });
    toast.success("Friend removed");
    void load();
  };

  return (
    <div className="rounded-2xl border border-[#E11B22]/40 bg-black/55 backdrop-blur-md shadow-2xl text-white p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold mb-1">Friends</h2>
      <p className="text-sm text-white/70 mb-4">Your Boro Fan Zone friends. Remove anyone you no longer want connected.</p>
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
    toast.success("Unblocked");
    void load();
  };

  return (
    <div className="rounded-2xl border border-[#E11B22]/40 bg-black/55 backdrop-blur-md shadow-2xl text-white p-5 sm:p-6">
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
              <img src={r.fan_avatar_url || boroDefaultAvatar} alt="" className="size-10 rounded-full object-cover ring-2 ring-white/10" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{r.fan_alias || "Boro fan"}</div>
                <div className="text-[11px] text-white/60">Ignored {new Date(r.created_at).toLocaleDateString()}</div>
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