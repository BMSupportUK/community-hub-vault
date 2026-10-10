import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, PiggyBank } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { ProfitCostsPanel } from "@/components/app/ProfitCostsPanel";
import financeTeamBg from "@/assets/finance-team-bg.jpg";

export const Route = createFileRoute("/_authenticated/_approved/admin-profit-costs")({
  head: () => ({
    meta: [
      { title: "Profit & costs — BM Support" },
      { name: "description", content: "Admin profit and product-cost breakdown by year and month." },
      { property: "og:title", content: "Profit & costs — BM Support" },
      { property: "og:description", content: "Admin profit and product-cost breakdown by year and month." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminProfitCostsPage,
});

function AdminProfitCostsPage() {
  const { hasRole, user } = useAuth();
  const isOwner = hasRole("admin") || hasRole("management");

  if (!isOwner) return <Navigate to="/home" />;
  if (!isAdminUnlocked(user?.id)) {
    return <Navigate to="/admin" search={{ next: "/admin-profit-costs" } as never} />;
  }

  return (
    <main className="relative flex-1 overflow-y-auto">
      <div
        aria-hidden
         className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-70"
        style={{ backgroundImage: `url(${financeTeamBg})` }}
      />
      <div
        aria-hidden
         className="pointer-events-none absolute inset-0 bg-background/35"
      />
       <div className="relative mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            search={{ tab: "order-status" } as never}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Orders
          </Link>
        </div>

         <div className="flex items-center gap-4 py-5 sm:py-8">
           <div className="grid size-14 shrink-0 place-items-center rounded-lg border border-accent/40 bg-card/90 text-accent shadow-elegant">
            <PiggyBank className="size-6" />
          </div>
          <div>
             <p className="mb-1 text-xs font-semibold text-foreground">BM SUPPORT · FINANCE</p>
             <h1 className="font-display text-3xl font-bold sm:text-4xl">Profit &amp; costs</h1>
          </div>
        </div>

        <ProfitCostsPanel />
      </div>
    </main>
  );
}
