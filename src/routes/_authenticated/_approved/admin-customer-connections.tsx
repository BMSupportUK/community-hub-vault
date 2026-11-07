import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { RolesGate } from "@/components/app/RolesGate";
import { PlayerConnectionLog } from "@/components/app/PlayerConnectionLog";
import { Button } from "@/components/ui/button";
import { isRolesUnlocked } from "@/lib/roles-unlock";

export const Route = createFileRoute("/_authenticated/_approved/admin-customer-connections")({
  validateSearch: (search: Record<string, unknown>): { customer?: string } => ({
    customer: typeof search.customer === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.customer) ? search.customer : undefined,
  }),
  component: CustomerConnectionsPage,
  head: () => ({ meta: [
    { title: "Customer connection logs | BM Support" },
    { name: "description", content: "BM Player customer playback connection history for the last 30 days." },
    { property: "og:title", content: "Customer connection logs | BM Support" },
    { property: "og:description", content: "BM Player customer playback connection history for the last 30 days." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
});

function CustomerConnectionsPage() {
  const { hasAny, loading, user } = useAuth();
  const { customer } = Route.useSearch();
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { setUnlocked(isRolesUnlocked(user?.id)); }, [user?.id]);
  if (loading) return null;
  if (!hasAny(["admin"])) return <Navigate to="/admin" search={{ tab: "customers" }} />;
  if (!unlocked) return <RolesGate onUnlocked={() => setUnlocked(true)} />;
  return <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-8">
    <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
      <h1 className="font-display text-2xl font-bold">{customer ? "Customer connection log" : "Connection logs"}</h1>
      <Button asChild variant="outline"><Link to="/admin" search={{ tab: "customers" }}><X className="size-4" />Close</Link></Button>
    </header>
    <PlayerConnectionLog userId={customer} />
  </main>;
}