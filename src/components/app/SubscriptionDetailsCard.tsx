import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CalendarClock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

interface CredRow {
  id: string;
  account_number: number;
  account_type: string | null;
  app_login_name: string | null;
  password: string | null;
  expiry_at: string | null;
}


export function SubscriptionDetailsCard() {
  const { user } = useAuth();
  const [creds, setCreds] = useState<CredRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setUsername(null);
      return;
    }
    let active = true;
    supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setUsername(data?.username ?? null);
      });
    return () => { active = false; };
  }, [user?.id]);

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
        className="h-full rounded-2xl border-2 border-violet-500/60 bg-surface shadow-[0_0_30px_rgba(139,92,246,0.25)] overflow-hidden flex flex-col mx-auto animate-pulse"
        style={{ width: 300, maxWidth: "100%" }}
      >
        <div className="aspect-[300/140] bg-muted" />
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
      className="h-full rounded-2xl border-2 border-violet-500/60 bg-surface shadow-[0_0_30px_rgba(139,92,246,0.25)] overflow-hidden flex flex-col mx-auto"
      style={{ width: 300, maxWidth: "100%" }}
    >
      {/* Header */}
      <div className="relative shrink-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.2),transparent_50%)]" />
        <div className="relative flex flex-col items-center justify-center text-white p-4 text-center">
          <CalendarClock className="size-10 mb-2 drop-shadow" />
          <h3 className="font-display font-bold text-lg leading-tight drop-shadow">
            Your Subscription Details
          </h3>
          <p className="text-xs text-white/85 mt-1">
            {hasCreds ? `${creds.length} active account${creds.length === 1 ? "" : "s"}` : "No accounts assigned"}
          </p>
          <Link
            to={username ? "/u/$username" : "/profile"}
            params={username ? { username } : undefined}
            search={username ? { tab: "creds" } : undefined}
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider border transition shadow-[0_0_16px_rgba(16,185,129,0.45)]",
              "bg-emerald-500/90 border-emerald-300/70 hover:bg-emerald-400 text-white"
            )}
          >
            View Details <ChevronDown className="size-3" />
          </Link>
        </div>
      </div>

      {/* Account expiry list */}
      {hasCreds && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {creds.map((c) => {
            const t = c.expiry_at ? new Date(c.expiry_at).getTime() : null;
            const expired = t !== null && t < now;
            const expSoon = t !== null && !expired && t - now < 7 * 86400_000;
            return (
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
            );
          })}
        </div>
      )}
    </div>
  );
}
