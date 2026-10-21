import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LeaderboardPage } from "./leaderboard";

export const Route = createFileRoute("/_authenticated/_approved/admin-referrals")({
  component: AdminReferralsPage,
  head: () => ({
    meta: [
      { title: "Referrals | BM Support Owner tools" },
      { name: "description", content: "Manage referral invites and referral bonuses." },
      { property: "og:title", content: "Referrals | BM Support Owner tools" },
      { property: "og:description", content: "Manage referral invites and referral bonuses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AdminReferralsPage() {
  const { hasAny } = useAuth();
  if (!hasAny(["admin", "management"])) return <Navigate to="/home" replace />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Link to="/admin" className="inline-flex items-center gap-2 px-4 pt-3 text-sm text-muted-foreground hover:text-foreground sm:px-8"><ArrowLeft className="size-4" /> Owner tools</Link>
      <LeaderboardPage admin />
    </div>
  );
}
