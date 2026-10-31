import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, Smartphone } from "lucide-react";
import { AppTransfersAdmin } from "@/components/app/AppTransfersAdmin";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/_approved/admin-app-transfers")({
  component: AppTransfersPage,
  head: () => ({
    meta: [
      { title: "App transfers — BM Support admin" },
      { name: "description", content: "Every app transfer to customers' devices, tracked by week." },
      { property: "og:title", content: "App transfers — BM Support admin" },
      { property: "og:description", content: "Every app transfer to customers' devices, tracked by week." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AppTransfersPage() {
  const { hasAny } = useAuth();
  if (!hasAny(["admin", "management", "staff"])) return <Navigate to="/admin" />;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to admin
        </Link>
        <h1 className="font-display text-xl font-bold inline-flex items-center gap-2">
          <Smartphone className="size-5 text-primary" /> App transfers
        </h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-3xl">
        Send apps straight to customers' devices and keep track of every transfer by week.
      </p>
      <AppTransfersAdmin />
    </div>
  );
}
