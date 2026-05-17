import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const DISMISS_KEY = "twofa-banner-dismissed";

export function TwoFactorBanner() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1") return;
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const hasVerified = (data?.totp ?? []).some((f) => f.status === "verified");
      setShow(!hasVerified);
    })();
  }, [user]);

  if (!show) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-rose-500/15 border-b border-amber-400/30 text-amber-100 text-sm">
      <div className="px-4 py-2 flex items-center gap-3">
        <ShieldAlert className="size-4 shrink-0 text-amber-300" />
        <div className="flex-1">
          We strongly recommend turning on{" "}
          <span className="font-semibold">two-factor authentication</span> to protect your account.{" "}
          <Link to="/account-security" className="underline font-medium hover:text-amber-50">
            Enable now
          </Link>
        </div>
        <button
          aria-label="Dismiss"
          onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setShow(false); }}
          className="p-1 rounded hover:bg-white/10"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
