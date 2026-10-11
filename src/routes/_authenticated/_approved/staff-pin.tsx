import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { StaffPinPanel } from "@/components/app/StaffPinPanel";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/_approved/staff-pin")({
  head: () => ({
    meta: [
      { title: "Staff PIN | BM Support" },
      { name: "description", content: "View your staff PIN and request a reset." },
    ],
  }),
  component: StaffPinPage,
});

function StaffPinPage() {
  const { hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);

  if (!isStaff) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <p className="text-sm text-muted-foreground">The staff PIN page is only for the support team.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-4">
        <Link to="/home" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back
        </Link>
        <StaffPinPanel />
      </div>
    </div>
  );
}
