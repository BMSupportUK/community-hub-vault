import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, MonitorUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { OrderScreenShareTab, useOrderScreenShares } from "@/components/tv/TvRemote";
import { canUseTvRemote } from "@/lib/tv-remote";

export const Route = createFileRoute("/_authenticated/_approved/screen-share/order/$orderId")({
  component: OrderScreenSharePage,
  head: () => ({
    meta: [
      { title: "Order screen share | BM Support Staff" },
      { name: "description", content: "Screen share help requests for one sale only." },
      { property: "og:title", content: "Order screen share | BM Support Staff" },
      { property: "og:description", content: "Screen share help requests for one sale only." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function OrderScreenSharePage() {
  const { orderId } = Route.useParams();
  const { roles, loading } = useAuth();
  const rows = useOrderScreenShares(orderId);
  if (loading) return null;
  if (!canUseTvRemote(roles)) return <Navigate to="/" />;
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link to="/admin-secure-page" search={{ order: orderId } as never}><ArrowLeft className="mr-1 h-4 w-4" />Back to order</Link>
        </Button>
        <h1 className="flex items-center gap-2 text-xl font-bold"><MonitorUp className="h-5 w-5 text-primary" />Screen share for this order</h1>
      </div>
      <OrderScreenShareTab orderId={orderId} rows={rows} />
    </div>
  );
}
