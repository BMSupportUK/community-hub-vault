import { Hash } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { accountNumberPillLabel } from "@/lib/account-number-label";
import { useCustomerNumber } from "@/components/app/CustomerNumber";
import { cn } from "@/lib/utils";

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
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/50 bg-primary/25 px-2.5 py-1 text-foreground",
        className,
      )}
      title="Your BM Player account number"
    >
      <Hash className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="text-[10px] font-bold uppercase tracking-wide">
        {accountNumberPillLabel(roles)}
      </span>
      <span className="font-mono text-sm font-bold leading-none tracking-[0.12em] tabular-nums">
        {number}
      </span>
    </span>
  );
}
