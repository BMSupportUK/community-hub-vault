import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, Landmark } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { BankTransferAdminCard } from "@/components/app/BankTransferAdminCard";

export const Route = createFileRoute("/_authenticated/_approved/admin-bank-transfer")({
  component: AdminBankTransferPage,
});

function AdminBankTransferPage() {
  const { hasRole, user } = useAuth();
  const isOwner = hasRole("admin");

  if (!isOwner) return <Navigate to="/home" />;
  if (!isAdminUnlocked(user?.id)) {
    return <Navigate to="/admin" search={{ next: "/admin-bank-transfer" } as never} />;
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground shadow-glow">
            <Landmark className="size-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Bank transfer</h1>
            <p className="text-sm text-muted-foreground">
              Manage the bank details customers see and choose who can pay by bank transfer.
            </p>
          </div>
        </div>

        <BankTransferAdminCard />
      </div>
    </main>
  );
}
