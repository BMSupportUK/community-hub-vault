import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Ban, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/rejected")({
  component: RejectedPage,
});

function RejectedPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.25),transparent_65%)]" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="size-20 rounded-full bg-gradient-to-br from-red-500 to-red-700 grid place-items-center shadow-[0_0_60px_rgba(239,68,68,0.6)] ring-2 ring-red-500/40 mb-6">
          <Ban className="size-10 text-white" strokeWidth={2.5} />
        </div>

        <h1 className="font-display text-4xl md:text-5xl font-extrabold text-white tracking-tight">
          Membership Rejected
        </h1>
        <p className="mt-3 text-red-200/90 text-base max-w-md">
          Your membership request has been rejected. If you believe this is a mistake,
          please contact an administrator.
        </p>

        <button
          onClick={handleSignOut}
          className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-[0_8px_30px_rgba(220,38,38,0.45)] transition-all"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
