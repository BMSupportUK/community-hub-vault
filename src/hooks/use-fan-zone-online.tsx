import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Read-only view of who is currently *in the Boro Fan Zone*.
 *
 * Deliberately separate from the app-shell presence channel: someone browsing
 * BM Support is not "online" in the Fan Zone, so the staff box must show them
 * as away. Tracking is done by `OnlineNowBox`; this hook only listens.
 */
export function useFanZoneOnlineUsers(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const channel = supabase.channel("presence:fanzone-online", {
      config: { presence: { key: `observer-${Math.random().toString(36).slice(2, 10)}` } },
    });
    const sync = () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      const next = new Set(
        Object.keys(state).filter((k) => !k.startsWith("guest-") && !k.startsWith("observer-")),
      );
      setIds((prev) => {
        if (prev.size === next.size && Array.from(next).every((id) => prev.has(id))) return prev;
        return next;
      });
    };
    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return ids;
}
