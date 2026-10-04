import { useEffect, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SecureLinkPanel } from "@/components/checkout/ManualOrderLinkDialog";
import { LiveHelpStaff } from "@/components/checkout/LiveHelpStaff";

export const Route = createFileRoute("/_authenticated/_approved/admin-secure-page")({
  validateSearch: (search: Record<string, unknown>): { order?: string; ref?: string } => ({
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
  const { hasRole } = useAuth();
  const { order, ref: refParam } = Route.useSearch();
  const [orderRef, setOrderRef] = useState<string | null>(refParam ?? null);
  const [loaded, setLoaded] = useState(!!refParam);

  useEffect(() => {
    if (!order) return;
    supabase.from("orders").select("order_ref").eq("id", order).maybeSingle()
      .then(({ data }) => { setOrderRef((data as never as { order_ref: string } | null)?.order_ref ?? null); setLoaded(true); });
  }, [order]);


  if (!hasRole("admin") && !hasRole("management")) return <Navigate to="/admin" />;
  if (!order) return <Navigate to="/admin" search={{ tab: "order-status" } as never} />;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full px-3 py-8 space-y-6">
        <Link to="/admin" search={{ tab: "order-status" } as never} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Orders
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold">Secure page · {orderRef ?? (loaded ? order.slice(0, 8) : "…")}</h1>
          <p className="text-sm text-muted-foreground">Copy the link and password to send to the customer, and reply to their messages here.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <SecureLinkPanel orderId={order} />
        </div>
        <LiveHelpStaff orderId={order} />
      </div>
    </main>
  );
}
