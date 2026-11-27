import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { PortalCodeForm } from "@/components/app/PortalCodeForm";
import { useAuth } from "@/hooks/use-auth";
import { requestMyPortalCode, unlockMyPortalCode } from "@/lib/customer-portal.functions";
import { PORTAL_EXPIRY_KEY, PORTAL_USER_KEY } from "@/lib/customer-portal";
import { useApplicationAccess } from "@/lib/admin-unlock";

export const PORTAL_LOCK_EVENT = "bm-portal-lock-change";

/** Customer content stays unmounted until the entered email code is verified. */
export function PortalLock({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const send = useServerFn(requestMyPortalCode);
  const verify = useServerFn(unlockMyPortalCode);
  const access = useApplicationAccess(user?.id);
  if (access.portal) return <>{children}</>;
  async function unlock(code: string) {
    if (!user) throw new Error("Please sign in again.");
    const result = await verify({ data: { loginCode: code } });
    window.localStorage.setItem(PORTAL_USER_KEY, user.id);
    window.localStorage.setItem(PORTAL_EXPIRY_KEY, result.expiresAt);
    window.dispatchEvent(new Event(PORTAL_LOCK_EVENT));
  }
  return (
    <div role="dialog" aria-label="Customer Portal locked" className="grid min-h-0 min-w-0 flex-1 place-items-center overflow-y-auto bg-background p-6">
      <div className="w-full max-w-md py-8 text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-primary/15 text-primary"><Lock className="size-6" /></div>
        <h2 className="font-display text-xl font-bold">Customer Portal locked</h2>
        <p className="mt-2 text-sm text-muted-foreground">Enter the login code emailed to you. Your code lasts 24 hours; portal access locks again after one hour.</p>
        <PortalCodeForm onSend={() => send()} onUnlock={unlock} />
        <Link to="/portal" className="mt-4 inline-block text-sm text-muted-foreground underline">Back to portal home</Link>
      </div>
    </div>
  );
}

/** True while the signed-in customer's portal is unlocked. */
export function usePortalUnlocked() {
  const { user } = useAuth();
  const access = useApplicationAccess(user?.id);
  return access.portal;
}
