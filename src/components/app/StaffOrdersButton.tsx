import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Counts = { fresh: number; awaiting: number; setup: number };

/**
 * Orders button for the Staff Portal home panel (above Working Status).
 * Hover shows a tooltip with live counts: new orders, awaiting payment and
 * account setup — the same split as the shop orders workflow tabs.
 * Clicking opens the admin dashboard Orders tab. Admin and management only.
 */
export function StaffOrdersButton({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Counts>({ fresh: 0, awaiting: 0, setup: 0 });
  const [hoverAnchor, setHoverAnchor] = useState<{ bottom: number; left?: number; right?: number } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select("id,status,paid_at,manual_pay_method")
      .in("status", ["pending", "processing", "paid"]);
    const rows = (data ?? []) as Array<{ id: string; status: string; paid_at: string | null; manual_pay_method: string | null }>;
    const invoiced = new Set<string>();
    if (rows.length > 0) {
      const { data: invs } = await supabase
        .from("order_invoices")
        .select("order_id,status,paid_at")
        .in("order_id", rows.map((r) => r.id));
      (invs ?? []).forEach((inv: any) => {
        const st = String(inv.status ?? "").toUpperCase();
        if (!inv.paid_at && st !== "PAID" && st !== "CANCELED" && st !== "CANCELLED" && st !== "VOIDED") {
          invoiced.add(inv.order_id);
        }
      });
    }
    let fresh = 0;
    let awaiting = 0;
    let setup = 0;
    for (const r of rows) {
      const paid = !!r.paid_at;
      const manual = !!r.manual_pay_method;
      if (r.status === "pending" && !paid && !manual && !invoiced.has(r.id)) fresh += 1;
      else if (!paid && (r.status === "processing" || manual || invoiced.has(r.id))) awaiting += 1;
      else setup += 1;
    }
    setCounts({ fresh, awaiting, setup });
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`staff-orders-button-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_invoices" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const total = counts.fresh + counts.awaiting + counts.setup;
  return (
    <>
      <div
        className={cn("relative", className)}
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const vw = window.innerWidth;
          if (vw - r.left < 190) setHoverAnchor({ bottom: r.bottom, right: vw - r.right });
          else setHoverAnchor({ bottom: r.bottom, left: r.left + r.width / 2 });
        }}
        onMouseLeave={() => setHoverAnchor(null)}
      >
        <button
          type="button"
          aria-label="Shop orders"
          title={total > 0 ? `${total} order${total === 1 ? "" : "s"} need attention` : "Shop orders"}
          onClick={() => { setHoverAnchor(null); void navigate({ to: "/admin", search: { tab: "order-status" } as never }); }}
          className={cn(
            "relative grid size-8 shrink-0 place-items-center rounded-full transition-colors",
            counts.fresh > 0
              ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
              : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <Receipt className="size-4" />
          {counts.fresh > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-4 text-destructive-foreground">
              {counts.fresh > 99 ? "99+" : counts.fresh}
            </span>
          )}
        </button>
        {hoverAnchor &&
          createPortal(
            <div
              className="pointer-events-none fixed z-[120] w-44 -translate-y-2 rounded-xl border border-border bg-popover p-3 text-xs shadow-2xl"
              style={{
                bottom: window.innerHeight - hoverAnchor.bottom + 8,
                left: hoverAnchor.left !== undefined ? hoverAnchor.left : undefined,
                right: hoverAnchor.right !== undefined ? hoverAnchor.right : undefined,
                transform: hoverAnchor.left !== undefined ? "translateX(-50%)" : undefined,
              }}
            >
              <p className="mb-1.5 font-semibold text-foreground">Shop orders</p>
              <div className="space-y-1 text-muted-foreground">
                <p className="flex justify-between"><span>New</span><span className="font-medium text-foreground">{counts.fresh}</span></p>
                <p className="flex justify-between"><span>Awaiting payment</span><span className="font-medium text-foreground">{counts.awaiting}</span></p>
                <p className="flex justify-between"><span>Account setup</span><span className="font-medium text-foreground">{counts.setup}</span></p>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground/70">Click to open Orders</p>
            </div>,
            document.body,
          )}
      </div>
    </>
  );
}
