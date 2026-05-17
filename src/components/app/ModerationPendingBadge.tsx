import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function ModerationPendingBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { count: c } = await supabase
        .from("gate_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (active) setCount(c ?? 0);
    };
    load();
    const channel = supabase
      .channel("moderation-pending-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gate_applications" },
        () => load(),
      )
      .subscribe();
    const interval = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} pending moderation items`}
      className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.7)]"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}