import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OrderRow = { status: string; paid_at: string | null };

/**
 * Header badge for the "Admin | Shop Orders" button.
 * Red circle = New order count, yellow circle = every other outstanding
 * status (awaiting payment, account setup) — mirrors the workflow tabs on
 * the shop orders screen.
 */
export function PendingOrdersBadge() {
  const [newCount, setNewCount] = useState(0);
  const [awaitingCount, setAwaitingCount] = useState(0);
  const [setupCount, setSetupCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("status,paid_at")
        .in("status", ["pending", "processing", "paid"]);
      if (!active) return;
      const rows = (data ?? []) as OrderRow[];
      let n = 0;
      let a = 0;
      let s = 0;
      for (const r of rows) {
        const paid = !!r.paid_at;
        if (r.status === "pending" && !paid) n += 1;
        else if (r.status === "processing" && !paid) a += 1;
        else s += 1;
      }
      setNewCount(n);
      setAwaitingCount(a);
      setSetupCount(s);
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

  const yellowCount = awaitingCount + setupCount;
  if (newCount <= 0 && yellowCount <= 0) return null;

  const yellowTitle = `Awaiting payment: ${awaitingCount} · Account setup: ${setupCount}`;
  return (
    <span className="ml-1 inline-flex items-center gap-1 align-middle">
      {newCount > 0 && (
        <span
          aria-label={`${newCount} new orders`}
          title={`${newCount} new order${newCount === 1 ? "" : "s"}`}
          className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.7)]"
        >
          {newCount > 99 ? "99+" : newCount}
        </span>
      )}
      {yellowCount > 0 && (
        <span
          aria-label={yellowTitle}
          title={yellowTitle}
          className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-warning text-warning-foreground text-[10px] font-bold leading-none shadow-[0_0_10px_rgba(202,138,4,0.6)]"
        >
          {yellowCount > 99 ? "99+" : yellowCount}
        </span>
      )}
    </span>
  );
}
