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


export function SubscriptionDetailsCard({
  compact = false,
  embedded = false,
  fill = false,
}: {
  compact?: boolean;
  embedded?: boolean;
  // Fill the parent's height so the panel absorbs leftover column space on the
  // member home hero instead of leaving a gap beneath the card.
  fill?: boolean;
}) {
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
          "overflow-hidden flex flex-col animate-pulse",
          embedded
            ? "w-full rounded-xl border border-white/25 bg-background/20 shadow-lg backdrop-blur-md"
            : "mx-auto rounded-2xl border-2 border-violet-500/60 bg-surface shadow-[0_0_30px_rgba(139,92,246,0.25)]",
          (!compact || fill) && "h-full",
        )}
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
        "overflow-hidden flex flex-col",
        embedded
          ? "w-full rounded-xl border border-white/25 bg-background/20 text-white shadow-lg backdrop-blur-md"
          : "mx-auto w-[300px] max-w-full rounded-2xl border-2 border-violet-500/60 bg-surface shadow-[0_0_30px_rgba(139,92,246,0.25)]",
        (!compact || fill) && "h-full",
      )}
    >
      {/* Header */}
      <div className="relative shrink-0 overflow-hidden">
        <div className={cn("absolute inset-0", embedded ? "bg-background/20" : "bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600")} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.2),transparent_50%)]" />
        <div className={cn(
          "relative flex flex-col items-center justify-center text-white text-center",
          fill ? "p-6" : compact ? "p-2.5" : "p-4",
        )}>
          <CalendarClock className={cn("shrink-0 drop-shadow", fill ? "size-10 mb-2" : compact ? "size-6 mb-1" : "size-10 mb-1")} />
          <h3 className={cn(
            "font-display font-bold leading-tight drop-shadow",
            fill ? "text-2xl" : compact ? "text-sm" : "text-lg",
          )}>
            Your Subscription Details
          </h3>
          <p className={cn("text-white/85", fill ? "text-sm mt-1.5" : compact ? "text-[10px] mt-0.5" : "text-xs mt-0.5")}>
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
          <div className={cn("flex-1 min-h-0 overflow-y-auto flex flex-col", fill ? "gap-4 p-4 justify-center" : compact ? "gap-1.5 p-2" : "gap-2 p-3")}>
            <div
              key={c.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg border",
                embedded ? "border-white/20 bg-background/20" : "border-border bg-surface-2/70",
                fill ? "flex-1 min-h-0 px-5 py-5" : compact ? "px-2 py-1.5" : "px-2.5 py-2",
              )}
            >
              <div className="min-w-0">
                <div className={cn("font-semibold truncate", fill ? "text-lg" : "text-xs", embedded ? "text-white" : "text-foreground")}>
                  Account {c.account_number}
                  <span className={cn("ml-1 font-normal", fill ? "text-sm" : "text-[10px]", embedded ? "text-white/70" : "text-muted-foreground")}>
                    · {accountTypeLabel(c.account_type)}
                  </span>
                </div>
                {c.app_login_name && (
                  <div className={cn("truncate", fill ? "text-base mt-1" : "text-[11px]", embedded ? "text-white/70" : "text-muted-foreground")}>
                    Login: <span className={cn("font-semibold", embedded ? "text-white" : "text-foreground")}>{c.app_login_name}</span>
                  </div>
                )}
                <div className={cn(
                  "font-medium",
                  fill ? "text-base mt-2" : "text-[11px] mt-0.5",
                  expired ? "text-red-300" : expSoon ? "text-amber-300" : "text-emerald-300"
                )}>
                  Expiry date: {c.expiry_at ? fmtDate(new Date(c.expiry_at)) : "No expiry date"}
                </div>
              </div>
              {c.expiry_at && (
                <span
                  className={cn(
                    "rounded-full border whitespace-nowrap shrink-0 font-semibold",
                    fill ? "text-sm px-3 py-1" : "text-[10px] px-1.5 py-0.5",
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
                className={cn(
                  "mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-violet-400/50 bg-violet-600/80 font-semibold text-white transition-colors hover:bg-violet-500",
                  fill ? "px-4 py-3 text-base" : compact ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-xs",
                )}
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
