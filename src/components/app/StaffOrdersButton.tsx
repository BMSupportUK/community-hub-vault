import { useCallback, useEffect, useState, type ReactNode } from "react";
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
export function StaffOrdersButton({ className, tile }: { className?: string; tile?: (count: number) => ReactNode }) {
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
          onClick={() => { setHoverAnchor(null); void navigate({ to: "/admin", search: { tab: "order-status" } as never }); }}
          className={tile ? "flex w-full items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-2.5 py-2 text-left text-white transition-colors hover:bg-white/20" : cn(
            "relative grid size-8 shrink-0 place-items-center rounded-full transition-colors",
            counts.fresh > 0
              ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
              : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
          )}
        >
          {tile ? tile(total) : <Receipt className="size-4" />}
          {!tile && counts.fresh > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-4 text-destructive-foreground">
              {counts.fresh > 99 ? "99+" : counts.fresh}
            </span>
          )}
        </button>
        {hoverAnchor &&
          createPortal(
            <div
              className={cn(
                "pointer-events-none fixed z-[80] w-max rounded-md border border-border bg-background px-2.5 py-1.5 text-left shadow-xl",
                hoverAnchor.left !== undefined && "-translate-x-1/2",
              )}
              style={{
                top: hoverAnchor.bottom + 6,
                ...(hoverAnchor.left !== undefined ? { left: hoverAnchor.left } : { right: (hoverAnchor.right ?? 0) + 8 }),
              }}
            >
              <div className="flex items-center justify-between gap-3 whitespace-nowrap text-[11px] font-medium">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-destructive" />New
                </span>
                <span className="font-bold text-destructive">{counts.fresh}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 whitespace-nowrap text-[11px] font-medium">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-amber-500" />Awaiting payment
                </span>
                <span className="font-bold text-amber-400">{counts.awaiting}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 whitespace-nowrap text-[11px] font-medium">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-500" />Account setup
                </span>
                <span className="font-bold text-emerald-400">{counts.setup}</span>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </>
  );
}
