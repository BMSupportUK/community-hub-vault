import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SecureLinkPanel } from "@/components/checkout/ManualOrderLinkDialog";
import { OrderVideoCallIncoming, OrderVideoCallStaffStage, useOrderVideoCallStaff } from "@/components/checkout/OrderVideoCall";
import { canViewStaffCheckout } from "@/lib/checkout-access";
import shopHero from "@/assets/shop-hero.jpg";

export const Route = createFileRoute("/_authenticated/_approved/admin-secure-page")({
  validateSearch: (search: Record<string, unknown>): { order?: string; ref?: string; call?: string } => ({
    call: typeof search.call === "string" ? (search.call as string) : undefined,
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
  const { order, ref: refParam, call: callParam } = Route.useSearch();
  const call = useOrderVideoCallStaff(order ?? "");
  const [orderRef, setOrderRef] = useState<string | null>(refParam ?? null);
  const [loaded, setLoaded] = useState(!!refParam);
  const autoAnswered = useRef(false);

  // Claimed from the Talk video help box: drop straight into that call.
  useEffect(() => {
    if (!callParam || autoAnswered.current || call.inCall || call.busy) return;
    if (call.session?.id !== callParam) return;
    autoAnswered.current = true;
    void call.answer();
  }, [callParam, call]);

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
        <div>
          <h1 className="font-display text-2xl font-bold">Secure page · {orderRef ?? (loaded ? order.slice(0, 8) : "…")}</h1>
          <p className="text-sm text-muted-foreground">Copy the link and password to send to the customer, and reply to their messages here.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/85 backdrop-blur-sm p-5 space-y-4">
          <SecureLinkPanel orderId={order} chatBubble orderRef={orderRef} sidebarTop={<OrderVideoCallIncoming call={call} />} />
        </div>
        <OrderVideoCallStaffStage call={call} orderId={order} />
      </div>
    </main>
  );
}
