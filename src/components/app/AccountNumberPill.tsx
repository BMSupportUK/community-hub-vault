import { Hash } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { accountNumberPillLabel } from "@/lib/account-number-label";
import { useCustomerNumber } from "@/components/app/CustomerNumber";
import { useAccountProfiles, useProfilePortal } from "@/components/app/AccountProfiles";
import { cn } from "@/lib/utils";

/**
 * Plain pill (no click action) showing the signed-in user's own BM Player
 * account number, so it can be read straight off the header when the app asks
 * for it. The caption above the number names it as the account. Renders
 * nothing until the number has loaded.
 */
export function AccountNumberPill({ className }: { className?: string }) {
  const { user, roles } = useAuth();
  const own = useCustomerNumber(user?.id);
  const { activeProfile } = useAccountProfiles();
  const { staff } = useProfilePortal();
  const number = activeProfile?.playerNumber ?? own;
  if (!number) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/50 bg-primary/25 px-2.5 py-1 text-foreground",
        className,
      )}
      title="Your BM Player account number"
    >
      <Hash className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="flex flex-col items-start leading-none">
        <span className="text-[10px] font-bold tracking-wide text-foreground/70">
          {staff ? accountNumberPillLabel(roles) : "Customer Account"}
        </span>
        <span className="mt-0.5 font-mono text-sm font-bold leading-none tracking-[0.12em] tabular-nums">
          {number}
        </span>
      </span>
    </span>
  );
}
