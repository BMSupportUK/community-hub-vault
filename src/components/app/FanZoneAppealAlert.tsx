import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getSound } from "@/lib/notification-sounds";
import { ensureSoundUnlocked, playSound } from "@/lib/sound";

/**
 * Plays the ban-appeal alert to admins / moderators whenever a Fan Zone member
 * opens a new appeal, and shows a toast that links to the Moderation centre.
 */
export function FanZoneAppealAlert() {
  const { user, hasAny } = useAuth();
  const navigate = useNavigate();
  const isStaff = hasAny(["admin", "management", "moderator", "boro_fan_zone_moderator"]);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !isStaff) return;
    const sound = getSound("fan-zone-appeal");
    if (sound) ensureSoundUnlocked([sound.src]);

    const ch = supabase
      .channel(`fan-zone-appeals-alert-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fan_zone_appeals" },
        (p) => {
          const row = p.new as { id?: string };
          if (!row?.id || seen.current.has(row.id)) return;
          seen.current.add(row.id);
          if (sound) void playSound(sound.src, { gain: sound.gain, label: sound.label });
          toast.info("New Fan Zone ban appeal", {
            description: "A member has appealed their ban.",
            action: {
              label: "Open",
              onClick: () => void navigate({ to: "/admin-reports" }),
            },
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, isStaff, navigate]);

  return null;
}
