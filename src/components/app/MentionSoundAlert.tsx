import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { playSound } from "@/lib/sound";
import mentionAudio from "@/assets/mention-notify.mp3";

type MentionNotification = {
  id: string;
  created_at: string;
};

/** App-wide mention audio, independent of where the notification bell renders. */
export function MentionSoundAlert() {
  const { user } = useAuth();
  const seen = useRef(new Set<string>());
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    if (!user || Capacitor.isNativePlatform()) return;
    let cancelled = false;

    const announce = (row: MentionNotification) => {
      if (seen.current.has(row.id)) return;
      seen.current.add(row.id);
      void playSound(mentionAudio, { label: `mention-${row.id}`, gain: 1.8 });
    };

    const poll = async () => {
      const { data, error } = await supabase
        .from("user_notifications")
        .select("id, created_at")
        .eq("user_id", user.id)
        .eq("kind", "mention")
        .is("read_at", null)
        .gte("created_at", new Date(mountedAt.current - 5_000).toISOString())
        .order("created_at", { ascending: true });
      if (cancelled || error) return;
      for (const row of (data ?? []) as MentionNotification[]) announce(row);
    };

    const channel = supabase
      .channel(`mention-sound-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as MentionNotification & { kind?: string };
          if (row.kind === "mention") announce(row);
        },
      )
      .subscribe();

    const timer = window.setInterval(() => void poll(), 10_000);
    const refresh = () => void poll();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return null;
}