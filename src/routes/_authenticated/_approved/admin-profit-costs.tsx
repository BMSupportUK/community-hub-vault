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
        className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-25"
        style={{ backgroundImage: `url(${financeTeamBg})` }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background"
      />
      <div className="relative w-full max-w-6xl mx-auto px-6 py-8 space-y-6">
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

        <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-md px-5 py-4 shadow-elegant">
          <div className="size-12 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground shadow-glow">
            <PiggyBank className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Profit &amp; costs</h1>
            <p className="text-sm text-muted-foreground">
              See what you are making each year and month, and set what each product costs you.
            </p>
          </div>
        </div>

        <ProfitCostsPanel />
      </div>
    </main>
  );
}
