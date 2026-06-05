import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Save, X, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import boroDefaultAvatar from "@/assets/boro-default-avatar.png";

/** Top-of-board card letting an approved fan zone member set an alias + avatar
 * used only inside the Boro Fan Zone. */
export function FanZoneAliasSettings() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const [open, setOpen] = useState(false);
  const [alias, setAlias] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [supporterSince, setSupporterSince] = useState<string>("");
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

  if (!user) return null;
  if (!isStaff && info?.status !== "approved") return null;

  const hasAlias = !!(info?.fanAlias || info?.fanAvatarUrl);
  const previewAvatar = info?.fanAvatarUrl || boroDefaultAvatar;
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
    setOpen(false);
  };

  const clear = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("set_my_fan_profile", {
      _alias: "", _avatar: "", _bio: "", _supporter_since: null as unknown as number, _fav_player: "", _matchday_memory: "",
    } as never);
    setSaving(false);
    if (error) return toast.error("Couldn't clear", { description: error.message });
    setAlias("");
    setAvatarUrl("");
    setBio(""); setSupporterSince(""); setFavPlayer(""); setMemory("");
    toast.success("Reverted to your main profile");
  };

  return (
    <div className="rounded-2xl border border-[#E11B22]/30 bg-surface-1/85 backdrop-blur-sm shadow-soft overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="size-10 rounded-full overflow-hidden bg-gradient-to-br from-[#E11B22] to-[#8B0F14] grid place-items-center text-white text-sm font-bold ring-2 ring-white/10 shrink-0">
          <img src={previewAvatar} alt="" className="size-10 object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#E11B22]/90">
            Your fan zone identity
          </div>
          <div className="text-sm font-semibold truncate">
            {info?.fanAlias || <span className="text-muted-foreground italic font-normal">Using your main profile</span>}
          </div>
        </div>
        {!open && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
            className="border-[#E11B22]/40 hover:border-[#E11B22] hover:bg-[#E11B22]/10"
          >
            <Pencil className="size-3.5 mr-1.5" />
            {hasAlias ? "Edit" : "Set alias"}
          </Button>
        )}
      </div>
      {open && (
        <div className="border-t border-border/60 bg-surface-2/40 px-4 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="size-14 rounded-full overflow-hidden bg-gradient-to-br from-[#E11B22] to-[#8B0F14] grid place-items-center text-white text-lg font-bold ring-2 ring-white/10 shrink-0">
              <img src={editPreviewAvatar} alt="" className="size-14 object-cover" />
            </div>
            <div className="flex-1 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <ImagePlus className="size-3.5 mr-1.5" />}
                {avatarUrl ? "Replace picture" : "Upload picture"}
              </Button>
              {avatarUrl && (
                <Button size="sm" variant="ghost" onClick={() => setAvatarUrl("")}>
                  Remove picture
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
          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Display name (Boro Fan Zone only)
            </label>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="e.g. Ayresome Ayatollah"
              maxLength={64}
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Shown on your posts and topics inside the fan zone. Leave blank to use your normal profile name.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Supporter since</label>
              <Input value={supporterSince} onChange={(e) => setSupporterSince(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="e.g. 1986" inputMode="numeric" maxLength={4} className="mt-1" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Favourite player</label>
              <Input value={favPlayer} onChange={(e) => setFavPlayer(e.target.value.slice(0, 80))} placeholder="e.g. Juninho" maxLength={80} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Bio</label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 500))} placeholder="Tell other Boro fans a bit about yourself" maxLength={500} rows={3} className="mt-1" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Favourite matchday memory</label>
            <Textarea value={memory} onChange={(e) => setMemory(e.target.value.slice(0, 280))} placeholder="e.g. The night we beat Steaua" maxLength={280} rows={2} className="mt-1" />
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {hasAlias && (
              <Button size="sm" variant="ghost" onClick={() => void clear()} disabled={saving}>
                Clear alias
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              <X className="size-3.5 mr-1.5" />Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={saving}
              className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white"
            >
              {saving ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Save className="size-3.5 mr-1.5" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}