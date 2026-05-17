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
    <div className="fixed bottom-4 right-4 z-50 max-w-[280px] animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-background/95 backdrop-blur-sm p-2.5 pr-2 shadow-lg">
        <ShieldAlert className="size-4 shrink-0 text-amber-500 mt-0.5" />
        <div className="flex-1 text-xs text-foreground/80 leading-snug">
          Secure your account with{" "}
          <Link to="/account-security" className="font-medium text-amber-600 dark:text-amber-400 underline-offset-2 hover:underline">
            2FA
          </Link>
        </div>
        <button
          aria-label="Dismiss"
          onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setShow(false); }}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}
