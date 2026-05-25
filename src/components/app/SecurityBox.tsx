import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, ShieldAlert, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export function SecurityBox() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setEnabled(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (error) {
        setEnabled(false);
        return;
      }
      const verified = (data?.totp ?? []).some((f) => f.status === "verified");
      setEnabled(verified);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user || enabled === null) return null;

  return (
    <section className="px-2 pt-4">
      <div className="rounded-lg bg-surface-2/60 border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-gradient-to-r from-emerald-600/10 via-cyan-600/10 to-blue-600/10">
          <div className="flex items-center gap-2">
            <Lock className="size-3.5 text-emerald-300" />
            <h2 className="font-display text-[11px] font-bold tracking-wider uppercase">Security</h2>
          </div>
        </div>
        <div className="px-3 py-3 flex items-center gap-2 text-xs">
          <span
            className={cn(
              "mt-0.5 size-2 rounded-full shrink-0",
              enabled
                ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]"
                : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]",
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground mb-1.5">Two-factor auth</div>
            {enabled ? (
              <Link
                to="/account-security"
                className="inline-flex items-center gap-1 mt-1 rounded-full px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold hover:bg-emerald-500/25 transition-colors"
              >
                <ShieldCheck className="size-3" />
                2FA on
              </Link>
            ) : (
              <Link
                to="/account-security"
                className="inline-flex items-center gap-1 mt-1 rounded-full px-2 py-0.5 bg-amber-500/15 border border-amber-500/50 text-amber-300 text-[11px] font-semibold hover:bg-amber-500/25 transition-colors animate-pulse"
              >
                <ShieldAlert className="size-3" />
                Enable 2FA
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}