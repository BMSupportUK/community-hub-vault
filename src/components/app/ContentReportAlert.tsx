import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getSound } from "@/lib/notification-sounds";
import { ensureSoundUnlocked, playSound } from "@/lib/sound";

/**
 * Plays the report alert to admins / moderators whenever a member reports a
 * post or message, and shows a toast that links to the Moderation centre.
 */
export function ContentReportAlert() {
  const { user, hasAny } = useAuth();
  const navigate = useNavigate();
  const isStaff = hasAny(["admin", "management", "moderator", "boro_fan_zone_moderator"]);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !isStaff) return;
    const sound = getSound("content-reported");
    ensureSoundUnlocked([sound?.src].filter(Boolean) as string[]);

    const ch = supabase
      .channel(`content-reports-alert-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "content_reports" },
        (p) => {
          const row = p.new as { id?: string; reporter_id?: string };
          if (!row?.id || seen.current.has(row.id)) return;
          if (row.reporter_id === user.id) return;
          seen.current.add(row.id);
          if (sound) void playSound(sound.src, { gain: sound.gain, label: sound.label });
          toast.info("New content report", {
            description: "A member has reported a post or message.",
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
