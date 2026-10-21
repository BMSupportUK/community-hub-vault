import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { requestMyPortalLink } from "@/lib/customer-portal.functions";
import { PORTAL_EXPIRY_KEY, portalSessionExpired } from "@/lib/customer-portal";

export const PORTAL_LOCK_EVENT = "bm-portal-lock-change";

function unlocked() {
  const at = window.localStorage.getItem(PORTAL_EXPIRY_KEY);
  return !!at && !portalSessionExpired(at);
}

/** Customers must open their emailed portal link before the portal shows; it relocks an hour later. */
export function PortalLock() {
  const { isStaff, user } = useAuth();
  const send = useServerFn(requestMyPortalLink);
  const [open, setOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const check = () => setOpen(unlocked());
    check();
    const id = window.setInterval(check, 5_000);
    window.addEventListener(PORTAL_LOCK_EVENT, check);
    window.addEventListener("storage", check);
    return () => { window.clearInterval(id); window.removeEventListener(PORTAL_LOCK_EVENT, check); window.removeEventListener("storage", check); };
  }, []);
  if (!user || isStaff || open !== false) return null;
  async function request() {
    setBusy(true); setError("");
    try { await send(); setSent(true); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(false); }
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Customer Portal locked" className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-xl">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-primary/15 text-primary"><Lock className="size-6" /></div>
        <h2 className="font-display text-xl font-bold">Customer Portal locked</h2>
        <p className="mt-2 text-sm text-muted-foreground">For your security we'll email you a login link. It lasts 24 hours, and the portal locks again one hour after each opening.</p>
        {sent ? <p role="status" className="mt-4 text-sm">Link sent — check your email (and spam folder) and open it on this device.</p>
          : <Button className="mt-5 w-full" disabled={busy} onClick={() => void request()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}Email me my login link</Button>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <Link to="/home" className="mt-4 inline-block text-sm text-muted-foreground underline">Back to home</Link>
      </div>
    </div>
  );
}
