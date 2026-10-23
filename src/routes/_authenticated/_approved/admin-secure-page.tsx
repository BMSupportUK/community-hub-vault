import { useEffect, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, MonitorUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SecureLinkPanel } from "@/components/checkout/ManualOrderLinkDialog";
import { OrderScreenShareTab, useOrderScreenShares } from "@/components/tv/TvRemote";
import { canViewStaffCheckout } from "@/lib/checkout-access";
import shopHero from "@/assets/shop-hero.jpg";

export const Route = createFileRoute("/_authenticated/_approved/admin-secure-page")({
  validateSearch: (search: Record<string, unknown>): { order?: string; ref?: string; tab?: "order" | "screen" } => ({
    tab: search.tab === "screen" ? "screen" : undefined,
    order: typeof search.order === "string" ? (search.order as string) : undefined,
    ref: typeof search.ref === "string" ? (search.ref as string) : undefined,
  }),

  head: () => ({
    meta: [
      { title: "Secure checkout page — BM Support" },
      { name: "description", content: "Secure page link, password and customer chat for a manual order." },
      { property: "og:title", content: "Secure checkout page — BM Support" },
      { property: "og:description", content: "Secure page link, password and customer chat for a manual order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SecurePageAdmin,
});

function SecurePageAdmin() {
  const { roles } = useAuth();
  const { order, ref: refParam, tab: tabParam } = Route.useSearch();
  const [tab, setTab] = useState<"order" | "screen">(tabParam ?? "order");
  const shares = useOrderScreenShares(order ?? "");
  const waiting = shares.filter((s) => s.status === "pending").length;
  const liveShares = shares.filter((s) => s.status !== "pending");
  const [orderRef, setOrderRef] = useState<string | null>(refParam ?? null);
  const [loaded, setLoaded] = useState(!!refParam);

  useEffect(() => {
    if (!order) return;
    supabase.rpc("staff_checkout_order_summary" as never, { p_order_id: order } as never)
      .then(({ data }) => { setOrderRef((data as unknown as { order_ref: string }[] | null)?.[0]?.order_ref ?? null); setLoaded(true); });
  }, [order]);


  if (!canViewStaffCheckout(roles)) return <Navigate to="/home" />;
  if (!order) return <Navigate to="/admin" search={{ tab: "order-status" } as never} />;

  return (
    <main className="relative isolate flex-1 min-h-full overflow-y-auto order-chat-gutter">
      {/* Same shop picture as the Orders tab, kept behind everything: it can
          never cover the header or the panel because it sits below all content
          and ignores pointer events. */}
      <div className="absolute inset-0 -z-10 pointer-events-none" aria-hidden="true">
        <img src={shopHero} alt="" className="h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-background/55" />
      </div>
      <div className="w-full px-3 py-8 space-y-6">
        <Link to="/admin" search={{ tab: "order-status" } as never} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Orders
        </Link>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <h1 className="font-display text-2xl font-bold">Secure page · {orderRef ?? (loaded ? order.slice(0, 8) : "…")}</h1>
            <div className="inline-flex rounded-xl border border-border bg-card/85 p-1 backdrop-blur-sm" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "order"} onClick={() => setTab("order")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "order" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Order</button>
          <button type="button" role="tab" aria-selected={tab === "screen"} onClick={() => setTab("screen")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === "screen" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            Screen share{waiting > 0 && <span className="rounded-full bg-destructive px-2 text-xs text-destructive-foreground animate-pulse">{waiting}</span>}
          </button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Copy the link and password to send to the customer, and reply to their messages here.</p>
        </div>
        <div className={tab === "order" ? "space-y-6" : "hidden"}>
          <div className="rounded-2xl border border-border bg-card/85 backdrop-blur-sm p-5 space-y-4">
            <SecureLinkPanel orderId={order} chatBubble orderRef={orderRef} sidebarTop={
              <div className="rounded-xl border border-border bg-surface-1 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <MonitorUp className="size-4 text-primary" /> Screen share
                  {waiting > 0 && <span className="rounded-full bg-destructive px-2 text-xs font-bold text-destructive-foreground animate-pulse">{waiting} waiting</span>}
                  {liveShares.length > 0 && <span className="rounded-full bg-primary/20 px-2 text-xs font-bold text-primary">{liveShares.length} in progress</span>}
                </div>
                {waiting === 0 && liveShares.length === 0 ? (
                  <p className="text-xs text-muted-foreground">When the customer presses Screen share help, the request appears here.</p>
                ) : (
                  <Link to="/screen-share/order/$orderId" params={{ orderId: order }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                    <MonitorUp className="size-3.5" /> {waiting > 0 ? "Answer screen share request" : "Open screen share"}
                  </Link>
                )}
              </div>
            } />
          </div>
        </div>
        {tab === "screen" && <OrderScreenShareTab orderId={order} rows={shares} />}
      </div>
    </main>
  );
}
