import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CalendarClock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CredRow {
  id: string;
  account_number: number;
  account_type: string | null;
  app_login_name: string | null;
  password: string | null;
  expiry_at: string | null;
}


export function SubscriptionDetailsCard({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const [creds, setCreds] = useState<CredRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);

  useEffect(() => {
    if (!user) {
      setCreds([]);
      setLoaded(true);
      return;
    }
    let active = true;
    const load = () => {
      supabase
        .from("app_credentials")
        .select("id, account_number, account_type, app_login_name, password, expiry_at")
        .eq("owner_id", user.id)
        .order("account_number", { ascending: true })
        .then(({ data }) => {
          if (!active) return;
          const rows = (data as CredRow[] | null) ?? [];
          const nowTs = Date.now();
          rows.sort((a, b) => {
            const aExpired = a.expiry_at ? new Date(a.expiry_at).getTime() < nowTs : false;
            const bExpired = b.expiry_at ? new Date(b.expiry_at).getTime() < nowTs : false;
            if (aExpired !== bExpired) return aExpired ? 1 : -1;
            return a.account_number - b.account_number;
          });
          setCreds(rows);
          setLoaded(true);
        });
    };
    load();
    const channel = supabase
      .channel(`home-subscription-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "credential_change_events", filter: `owner_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const accountTypeLabel = (type: string | null) => {
    const t = (type ?? "single").toLowerCase();
    if (t === "single") return "Single";
    if (t === "multi") return "Multi-room";
    if (t === "triple") return "Triple-room";
    return type ?? "Single";
  };

  if (!loaded) {
    return (
      <div
        className={cn(
          "rounded-2xl border-2 border-violet-500/60 bg-surface shadow-[0_0_30px_rgba(139,92,246,0.25)] overflow-hidden flex flex-col mx-auto animate-pulse",
          !compact && "h-full",
        )}
        style={{ width: 300, maxWidth: "100%" }}
      >
        <div className={compact ? "aspect-[300/76] bg-muted" : "aspect-[300/140] bg-muted"} />
        <div className="flex-1 p-4 space-y-3">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-5/6" />
        </div>
      </div>
    );
  }

  const hasCreds = creds.length > 0;
  const now = Date.now();

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-violet-500/60 bg-surface shadow-[0_0_30px_rgba(139,92,246,0.25)] overflow-hidden flex flex-col mx-auto",
        !compact && "h-full",
      )}
      style={{ width: 300, maxWidth: "100%" }}
    >
      {/* Header */}
      <div className="relative shrink-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.2),transparent_50%)]" />
        <div className={cn(
          "relative flex flex-col items-center justify-center text-white text-center",
          compact ? "p-2.5" : "p-4",
        )}>
          <CalendarClock className={cn("mb-1 drop-shadow", compact ? "size-6" : "size-10 mb-2")} />
          <h3 className={cn(
            "font-display font-bold leading-tight drop-shadow",
            compact ? "text-sm" : "text-lg",
          )}>
            Your Subscription Details
          </h3>
          <p className={cn("text-white/85 mt-0.5", compact ? "text-[10px]" : "text-xs")}>
            {hasCreds ? `${creds.length} active account${creds.length === 1 ? "" : "s"}` : "No accounts assigned"}
          </p>
        </div>
      </div>

      {/* Account expiry — one at a time with next button */}
      {hasCreds && (() => {
        const safeIndex = Math.min(viewIndex, creds.length - 1);
        const c = creds[safeIndex];
        const t = c.expiry_at ? new Date(c.expiry_at).getTime() : null;
        const expired = t !== null && t < now;
        const expSoon = t !== null && !expired && t - now < 7 * 86400_000;
        return (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/70 border border-border px-2.5 py-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">
                  Account {c.account_number}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    · {accountTypeLabel(c.account_type)}
                  </span>
                </div>
                {c.app_login_name && (
                  <div className="text-[11px] text-muted-foreground truncate">
                    Login: <span className="font-semibold text-foreground">{c.app_login_name}</span>
                  </div>
                )}
                <div className={cn(
                  "text-[11px] font-medium mt-0.5",
                  expired ? "text-red-300" : expSoon ? "text-amber-300" : "text-emerald-300"
                )}>
                  Expiry date: {c.expiry_at ? fmtDate(new Date(c.expiry_at)) : "No expiry date"}
                </div>
              </div>
              {c.expiry_at && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap shrink-0 font-semibold",
                    expired
                      ? "text-white border-red-400/50 bg-red-600 expiry-date-flash"
                      : expSoon
                        ? "text-white border-amber-300/50 bg-amber-500 expiry-date-flash-amber"
                        : "text-emerald-100 border-emerald-300/50 bg-emerald-500/80",
                  )}
                >
                  {expired ? "Expired" : expSoon ? "Expiring" : "Active"}
                </span>
              )}
            </div>
            {creds.length > 1 && (
              <button
                type="button"
                onClick={() => setViewIndex((safeIndex + 1) % creds.length)}
                className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-violet-400/50 bg-violet-600/80 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500"
              >
                View Next Subscription Details
                <ChevronRight className="size-3.5" />
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}
