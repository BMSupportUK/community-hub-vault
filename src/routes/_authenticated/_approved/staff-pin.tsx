import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, KeyRound } from "lucide-react";
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
      <div className="absolute inset-0 -z-10 bg-background/70" />
      {/* Soft glow accents */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 size-[420px] -translate-x-1/2 rounded-full bg-primary/25 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 -z-10 size-[360px] rounded-full bg-fuchsia-500/15 blur-[120px]" />

      <div className="relative mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center gap-6 p-4 py-10 sm:p-8">
        <Link to="/home" className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="size-3.5" /> Back
        </Link>

        <header className="flex flex-col items-center gap-3 text-center">
          <div className="grid size-16 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow ring-1 ring-white/25">
            <KeyRound className="size-7" />
          </div>
          <h1 className="font-display text-3xl font-bold leading-tight text-gradient-primary sm:text-4xl">Your staff PIN</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your PIN works with your password to unlock the admin dashboard. Keep it private — never share it with customers.
          </p>
        </header>

        <div className="w-full">
          <StaffPinPanel />
        </div>
      </div>
    </div>
  );
}
