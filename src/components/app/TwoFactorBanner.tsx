import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { LoaderCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useVisitorVpnStatus } from "@/hooks/use-visitor-vpn";

export function TwoFactorBanner() {
  return null;
}

export function TwoFactorPill() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setEnabled(null);
      return;
    }
    let cancelled = false;
    const check = async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (error) {
        setEnabled(false);
        return;
      }
      const verified = (data?.totp ?? []).some((f) => f.status === "verified");
      setEnabled(verified);
    };
    check();
  }, [user?.id]);

  if (!user || enabled === null) return null;

  if (enabled) {
    return (
      <Link
        to="/account-security"
        title="Two-factor authentication is on"
        className="hidden md:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[11px] font-semibold hover:bg-emerald-500/25 transition-colors"
      >
        <ShieldCheck className="size-3.5" />
        <span className="hidden xl:inline">2FA on</span>
      </Link>
    );
  }

  return (
    <Link
      to="/account-security"
      title="Enable two-factor authentication"
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-amber-500/15 border border-amber-500/50 text-amber-400 text-[11px] font-semibold hover:bg-amber-500/25 transition-colors animate-pulse"
    >
      <ShieldAlert className="size-3.5" />
      <span className="hidden xl:inline">Enable 2FA</span>
    </Link>
  );
}

export function VpnPill() {
  const status = useVisitorVpnStatus();
  if (status === "protected") {
    return (
      <span
        title="VPN or proxy detected on your connection"
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[11px] font-semibold"
      >
        <ShieldCheck className="size-3.5" />
        <span className="hidden xl:inline">VPN on</span>
      </span>
    );
  }
  if (status === "checking") {
    return (
      <span title="Checking your connection" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-muted border border-border text-muted-foreground text-[11px] font-semibold">
        <LoaderCircle className="size-3.5 animate-spin" />
        <span className="hidden xl:inline">Checking VPN</span>
      </span>
    );
  }
  if (status === "unavailable") {
    return (
      <span title="VPN check is temporarily unavailable" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-amber-500/15 border border-amber-500/50 text-amber-400 text-[11px] font-semibold">
        <ShieldAlert className="size-3.5" />
        <span className="hidden xl:inline">VPN unknown</span>
      </span>
    );
  }
  return (
    <span
      title="No VPN detected — your connection is not protected"
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-red-500/15 border border-red-500/50 text-red-400 text-[11px] font-semibold"
    >
      <ShieldAlert className="size-3.5" />
      <span className="hidden xl:inline">VPN off</span>
    </span>
  );
}
