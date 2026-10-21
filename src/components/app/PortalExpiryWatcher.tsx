import { useEffect } from "react";
import { PORTAL_EXPIRY_KEY, portalSessionExpired } from "@/lib/customer-portal";

/** Locks (signs out) a portal-link sign-in one hour after opening. Normal sign-ins are untouched. */
export function PortalExpiryWatcher() {
  useEffect(() => {
    const check = () => {
      const at = window.localStorage.getItem(PORTAL_EXPIRY_KEY);
      if (at && portalSessionExpired(at)) {
        window.localStorage.removeItem(PORTAL_EXPIRY_KEY);
        window.dispatchEvent(new Event("bm-portal-lock-change"));
      }
    };
    check();
    const id = window.setInterval(check, 15_000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}
