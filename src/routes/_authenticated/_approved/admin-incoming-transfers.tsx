import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { WiseIncomingCard } from "@/components/app/WiseIncomingCard";

export const Route = createFileRoute("/_authenticated/_approved/admin-incoming-transfers")({
  head: () => ({
    meta: [
      { title: "Incoming transfers — BM Support" },
      { name: "description", content: "All incoming Wise bank transfers by year and month." },
      { property: "og:title", content: "Incoming transfers — BM Support" },
      { property: "og:description", content: "All incoming Wise bank transfers by year and month." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IncomingTransfersPage,
});

function IncomingTransfersPage() {
  const { hasRole, user } = useAuth();
  if (!(hasRole("admin") || hasRole("management"))) return <Navigate to="/home" />;
  if (!isAdminUnlocked(user?.id)) {
    return <Navigate to="/admin" search={{ next: "/admin-incoming-transfers" } as never} />;
  }
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full px-6 py-8 space-y-6">
        <Link
          to="/admin"
          search={{ tab: "bank-transfer-orders" } as never}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to bank transfer orders
        </Link>
        <WiseIncomingCard hidePending />
      </div>
    </main>
  );
}
