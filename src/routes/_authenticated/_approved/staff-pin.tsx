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
      { property: "og:title", content: "Staff PIN | BM Support" },
      { property: "og:description", content: "View your staff PIN and request a reset." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
    <div className="relative isolate h-full min-h-dvh w-full min-w-0 flex-1 overflow-y-auto lg:min-h-0">
      <img src={pinIllustration} alt="" aria-hidden="true" className="absolute inset-0 -z-20 size-full object-cover object-center" />
      <div className="absolute inset-0 -z-10 bg-background/80" />
      <div className="relative w-full space-y-6 p-4 sm:p-8 lg:p-10">
        <Link to="/home" className="inline-flex items-center gap-1.5 text-xs text-foreground hover:text-primary">
          <ArrowLeft className="size-3.5" /> Back
        </Link>

        <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight text-foreground">Your staff PIN</h1>
        <div className="w-full max-w-lg">
          <StaffPinPanel />
        </div>
      </div>
    </div>
  );
}
