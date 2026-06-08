import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
        )}
      </div>
    </div>
  );
}