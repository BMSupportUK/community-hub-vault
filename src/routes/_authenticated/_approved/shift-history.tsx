import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import ShiftHistoryPanel from "@/components/app/ShiftHistoryPanel";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/_approved/shift-history")({
  head: () => ({
    meta: [
      { title: "Shift History | BM Support" },
      { name: "description", content: "Your shift history, breaks and Away time." },
    ],
  }),
  component: ShiftHistoryPage,
});

function ShiftHistoryPage() {
  const { hasAny, user, profile } = useAuth() as any;
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);

  if (!isStaff || !user) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <p className="text-sm text-muted-foreground">Shift history is only for the support team.</p>
      </div>
    );
  }

  const name = profile?.full_name || profile?.username || user.email || "Staff";
  const username = profile?.username || "";

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="w-full space-y-4">
        <Link to="/home" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back
        </Link>
        <ShiftHistoryPanel userId={user.id} name={name} username={username} />
      </div>
    </div>
  );
}
