import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function PendingOrdersBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { count: c } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (active) setCount(c ?? 0);
    };
    load();
    const channel = supabase
      .channel("pending-orders-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => load(),
      )
      .subscribe();
    // Realtime postgres_changes above handles fresh updates;
    // this interval is only a reconciliation safety net.
    const interval = setInterval(load, 120_000);
    return () => {
      active = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} pending orders`}
      className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.7)]"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}