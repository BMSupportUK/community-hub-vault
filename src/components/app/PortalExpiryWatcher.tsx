import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PORTAL_EXPIRY_KEY, portalSessionExpired } from "@/lib/customer-portal";

/** Signs out a portal-link sign-in once its 24 hours are up. Normal sign-ins are untouched. */
export function PortalExpiryWatcher() {
  useEffect(() => {
    const check = () => {
      const at = window.localStorage.getItem(PORTAL_EXPIRY_KEY);
      if (at && portalSessionExpired(at)) {
        window.localStorage.removeItem(PORTAL_EXPIRY_KEY);
        void supabase.auth.signOut();
      }
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}
