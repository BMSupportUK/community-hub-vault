import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { StaffPinPanel } from "@/components/app/StaffPinPanel";
import { useAuth } from "@/hooks/use-auth";
import pinIllustration from "@/assets/staff-pin-illustration.jpg";

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
      <div className="max-w-2xl mx-auto space-y-5">
        <Link to="/home" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back
        </Link>

        <div className="relative overflow-hidden rounded-3xl border border-border shadow-xl">
          <img
            src={pinIllustration}
            alt="A member of staff looking at a locked screen"
            className="absolute inset-0 size-full object-cover"
            width={1024}
            height={768}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/70 to-background/20" />
          <div className="relative p-6 sm:p-8 max-w-sm">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary mb-1">Staff security</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">Your staff PIN</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Your PIN works with your password to unlock the admin dashboard. View it here, or request a new one if it's been compromised.
            </p>
          </div>
        </div>

        <StaffPinPanel />
      </div>
    </div>
  );
}
