import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Live "online now" counter for the Fan Zone sidebar.
 * Uses its own presence channel (separate from the app shell presence)
 * so guests are counted too.
 */
export function OnlineNowBox() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [members, setMembers] = useState(0);

  useEffect(() => {
    const key = user?.id ?? `guest-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel("presence:fanzone-online", {
      config: { presence: { key } },
    });
    const sync = () => {
      const state = channel.presenceState() as Record<string, Array<{ guest?: boolean }>>;
      const keys = Object.keys(state);
      setCount(keys.length);
      setMembers(keys.filter((k) => !k.startsWith("guest-")).length);
    };
    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ guest: !user?.id, at: new Date().toISOString() });
        }
      });
    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const guests = Math.max(0, count - members);

  return (
    <section className="boro-inner-panel rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider font-bold text-[#E11B22] flex items-center gap-1">
          <Users className="size-3" /> Online now
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)] animate-pulse" />
          Live
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-2xl font-display font-bold text-emerald-400 leading-none tabular-nums">
          {count}
        </span>
        <span className="text-[10px] text-muted-foreground leading-tight">
          {count === 1 ? "person browsing" : "people browsing"}
          <br />
          {members} signed in · {guests} guest{guests === 1 ? "" : "s"}
        </span>
      </div>
    </section>
  );
}
