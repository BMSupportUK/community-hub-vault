import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Subscribes to a shared Realtime Presence channel so every signed-in viewer
 * is broadcast as "online". Returns a Set of user IDs currently present.
 */
export function useOnlineUsers(): Set<string> {
  const { user } = useAuth();
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) {
      setOnline(new Set());
      return;
    }
    const uid = user.id;
    const ping = () => {
      supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", uid).then(() => {});
    };
    ping();
    const pingInterval = setInterval(ping, 60_000);
    const onUnload = () => {
      try { ping(); } catch { /* noop */ }
    };
    window.addEventListener("beforeunload", onUnload);

    const channel = supabase.channel("presence:online", {
      config: { presence: { key: uid } },
    });

    const sync = () => {
      const state = channel.presenceState();
      setOnline(new Set(Object.keys(state)));
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: uid, online_at: new Date().toISOString() });
        }
      });

    return () => {
      clearInterval(pingInterval);
      window.removeEventListener("beforeunload", onUnload);
      ping();
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return online;
}
