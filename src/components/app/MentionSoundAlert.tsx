import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ensureSoundUnlocked, playSound } from "@/lib/sound";
import { getSound } from "@/lib/notification-sounds";
import mentionAudio from "@/assets/mention-notify.mp3";

type MentionNotification = {
  id: string;
  created_at: string;
  link_path?: string | null;
  kind?: string | null;
};

/** Notification kinds that mean "you are wanted somewhere". */
const ALERT_KINDS = ["mention", "staff_mention", "ticket_help_requested"] as const;

/** Dane J — gets a bespoke voice clip when BM Support needs him mid Fan Zone. */
const DANE_USER_ID = "73c113ce-ce1b-43f0-af24-c2a36cf0d8e7";




/** Boro Fan Zone mentions get their own clip, kept separate from BM Support. */
const isFanZoneMention = (row: MentionNotification) => !!row.link_path && row.link_path.startsWith("/forum");

/** App-wide mention audio, independent of where the notification bell renders. */
export function MentionSoundAlert() {
  const { user } = useAuth();
  const seen = useRef(new Set<string>());
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    if (!user || Capacitor.isNativePlatform()) return;
    ensureSoundUnlocked();
    let cancelled = false;


    const announce = (row: MentionNotification) => {
      if (seen.current.has(row.id)) return;
      seen.current.add(row.id);
      const kind = row.kind ?? "mention";
      if (kind === "mention" && isFanZoneMention(row)) {
        const fanZone = getSound("fan-zone-mention");
        void playSound(fanZone?.src ?? mentionAudio, {
          label: `mention-${row.id}`,
          gain: fanZone?.gain ?? 1.8,
        });
        return;
      }
      // BM Support wants Dane: bespoke voice clip (louder cue than the chime).
      // Fires for any BM Support alert, and always while he is in the Fan Zone.
      if (user?.id === DANE_USER_ID) {
        const needed = getSound("dane-bm-support");
        if (needed) {
          void playSound(needed.src, { label: `bm-support-needed-${row.id}`, gain: needed.gain });
          return;
        }
      }
      if (kind !== "mention") return; // other kinds have their own alerts elsewhere
      void playSound(mentionAudio, { label: `mention-${row.id}`, gain: 1.8 });
    };


    const poll = async () => {
      const { data, error } = await supabase
        .from("user_notifications")
        .select("id, created_at, link_path, kind")
        .eq("user_id", user.id)
        .in("kind", ALERT_KINDS as unknown as string[])
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
          const row = payload.new as MentionNotification;
          if (ALERT_KINDS.includes((row.kind ?? "") as (typeof ALERT_KINDS)[number])) announce(row);
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