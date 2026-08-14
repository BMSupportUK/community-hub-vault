import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FanZoneInfo } from "@/hooks/use-fan-zone";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { useAuth } from "@/hooks/use-auth";

/**
 * Self-contained gate: drop this on any Boro Fan Zone surface and it will ask
 * for a display name whenever the signed-in fan has a Fan Zone relationship
 * (approved, pending, or staff) but no Fan Zone name yet.
 */
export function FanZoneNameGate() {
  const { user, hasAny } = useAuth();
  const info = useFanZoneMembership(user?.id ?? null);
  const isStaff = hasAny(["admin", "management", "boro_fan_zone_moderator"]);
  const inZone = isStaff || info?.status === "approved" || info?.status === "pending";
  if (!user) return null;
  return <FanZoneNamePrompt info={info} canEnter={inZone} />;
}

/**
 * Forces first-time Boro Fan Zone members to choose a display name.
 * The membership row is watched in realtime by useFanZoneMembership, so once
 * the name is saved every fan zone surface picks it up without a refresh.
 */
export function FanZoneNamePrompt({ info, canEnter }: { info: FanZoneInfo | null; canEnter: boolean }) {
  const needsName = canEnter && !!info && !(info.fanAlias && info.fanAlias.trim());
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!needsName) setName("");
  }, [needsName]);

  const save = async () => {
    const alias = name.trim();
    if (alias.length < 3) return toast.error("Pick a display name of at least 3 characters");
    if (alias.length > 64) return toast.error("Display name too long (max 64)");
    setSaving(true);
    const { error } = await supabase.rpc("set_my_fan_profile", {
      _alias: alias,
      _avatar: info?.fanAvatarUrl ?? "",
      _bio: info?.bio ?? "",
      _supporter_since: (info?.supporterSince ?? null) as number,
      _fav_player: info?.favPlayer ?? "",
      _matchday_memory: info?.matchdayMemory ?? "",
    } as never);
    setSaving(false);
    if (error) return toast.error("Couldn't save your display name", { description: error.message });
    toast.success(`Welcome to the Fan Zone, ${alias}!`);
  };

  return (
    <Dialog open={needsName}>
      <DialogContent
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="[&>button]:hidden border-[#E11B22]/50 bg-[#0B0E14] text-white shadow-[0_24px_70px_-20px_rgba(225,27,34,0.65)]"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-black flex items-center gap-2 text-white">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF3B41] to-[#8B0F14] text-white">
              <UserCog className="size-4" />
            </span>
            Choose your Fan Zone name
          </DialogTitle>
          <DialogDescription className="text-white/70">
            This is the name other Boro fans see on your posts, replies and messages. Your BM Support
            profile name stays private.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            placeholder="e.g. Ayresome Angel"
            className="bg-white/10 border-white/25 text-white placeholder:text-white/45 focus-visible:ring-[#E11B22]"
          />
          <Button
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white font-semibold"
          >
            {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null}
            Save display name
          </Button>
          <p className="text-[11px] text-white/55 text-center">You can change it later in Profile &amp; Settings.</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
