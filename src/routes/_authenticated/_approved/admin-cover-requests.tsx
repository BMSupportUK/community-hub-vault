import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { ArrowLeft, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { CoverRequestsPanel } from "@/components/app/CoverRequestsPanel";

export const Route = createFileRoute("/_authenticated/_approved/admin-cover-requests")({
  head: () => ({
    meta: [
      { title: "Cover sign-in requests | BM Support" },
      { name: "description", content: "Approve or decline staff cover sign-in requests and review the cover log." },
      { property: "og:title", content: "Cover sign-in requests | BM Support" },
      { property: "og:description", content: "Approve or decline staff cover sign-in requests and review the cover log." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCoverRequests,
});

function AdminCoverRequests() {
  const { hasAny, user } = useAuth();
  const canDecide = hasAny(["admin", "management"]);

  if (!canDecide) return <Navigate to="/admin" />;
  if (!isAdminUnlocked(user?.id)) {
    return <Navigate to="/admin" search={{ next: "/admin-cover-requests" } as never} />;
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full px-6 py-8 space-y-4">
        <Link to="/admin" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back to owner panel
        </Link>
        <div className="rounded-2xl border border-border bg-surface-1 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center">
              <UserPlus className="size-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold">Cover sign-in requests</h1>
              <p className="text-xs text-muted-foreground">
                Approve or decline staff cover sign-in requests and review the recent cover log.
              </p>
            </div>
          </div>
          <CoverRequestsPanel />
        </div>
      </div>
    </main>
  );
}
