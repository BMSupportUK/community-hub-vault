import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Timer } from "lucide-react";
import { PortalCodeForm } from "@/components/app/PortalCodeForm";
import { useAuth } from "@/hooks/use-auth";
import { requestMyPortalCode, unlockMyPortalCode } from "@/lib/customer-portal.functions";
import { PORTAL_EXPIRY_KEY, PORTAL_USER_KEY, portalAccessValid, portalSecondsRemaining, portalCountdown } from "@/lib/customer-portal";

export const PORTAL_LOCK_EVENT = "bm-portal-lock-change";

function unlocked(userId: string) {
  try {
    return portalAccessValid(window.localStorage.getItem(PORTAL_EXPIRY_KEY), window.localStorage.getItem(PORTAL_USER_KEY), userId);
  } catch { return false; }
}

/** Customer content stays unmounted until the entered email code is verified. */
export function PortalLock({ children }: { children: ReactNode }) {
  const { isStaff, user } = useAuth();
  const send = useServerFn(requestMyPortalCode);
  const verify = useServerFn(unlockMyPortalCode);
  const [grant, setGrant] = useState<{ userId: string; open: boolean } | null>(null);
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const check = () => {
      const open = user ? unlocked(user.id) : false;
      setGrant(user ? { userId: user.id, open } : null);
      try { setRemaining(open ? portalSecondsRemaining(window.localStorage.getItem(PORTAL_EXPIRY_KEY)) : 0); } catch { setRemaining(0); }
    };
    check();
    const id = window.setInterval(check, 1_000);
    window.addEventListener(PORTAL_LOCK_EVENT, check);
    window.addEventListener("storage", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(id); window.removeEventListener(PORTAL_LOCK_EVENT, check); window.removeEventListener("storage", check); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [user?.id]);
  if (isStaff) return <>{children}</>;
  if (user && grant?.userId === user.id && grant.open) return <>{children}</>;
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
        <p className="mt-2 text-sm text-muted-foreground">Enter the login code emailed to you. Your code lasts 24 hours; portal access lasts one hour.</p>
        <PortalCodeForm onSend={() => send()} onUnlock={unlock} />
        <Link to="/home" className="mt-4 inline-block text-sm text-muted-foreground underline">Back to home</Link>
      </div>
    </div>
  );
}
