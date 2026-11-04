import { Hash } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isStaffPortalUser } from "@/lib/portal-home";
import { useCustomerNumber } from "@/components/app/CustomerNumber";
import { cn } from "@/lib/utils";

/**
 * Header label for the account number: staff see "Staff", everyone else sees
 * "Customer Account". The number itself is the same permanent 6-digit BM
 * account number the BM Player asks for on every open.
 */
export function accountNumberPillLabel(roles: readonly string[]) {
  return isStaffPortalUser(roles) ? "Staff" : "Customer Account";
}

/**
 * Plain pill (no click action) showing the signed-in user's own BM Player
 * account number, so it can be read straight off the header when the app asks
 * for it. Renders nothing until the number has loaded.
 */
export function AccountNumberPill({ className }: { className?: string }) {
  const { user, roles } = useAuth();
  const number = useCustomerNumber(user?.id);
  if (!number) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-primary",
        className,
      )}
      title="Your BM Player account number"
    >
      <Hash className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      <span className="text-[9px] font-semibold uppercase tracking-wide opacity-75">
        {accountNumberPillLabel(roles)}
      </span>
      <span className="font-mono text-sm font-bold leading-none tracking-[0.12em] tabular-nums">
        {number}
      </span>
    </span>
  );
}
