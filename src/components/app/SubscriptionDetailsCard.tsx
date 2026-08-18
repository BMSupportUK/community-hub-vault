import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { CalendarClock, Copy, Check, Eye, EyeOff, KeyRound, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

function formatTabLabel(name: string | null, index: number) {
  if (name) return name.length > 10 ? name.slice(0, 9) + "…" : name;
  return `Sub ${index + 1}`;
}

interface CredRow {
  id: string;
  app_login_name: string | null;
  password: string | null;
  expiry_at: string | null;
}

export function SubscriptionDetailsCard() {
  const { user } = useAuth();
  const tz = useUserTimezone();
  const [creds, setCreds] = useState<CredRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);

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
        .select("id, app_login_name, password, expiry_at")
        .eq("owner_id", user.id)
        .order("expiry_at", { ascending: false })
        .then(({ data }) => {
          if (!active) return;
          setCreds((data as CredRow[] | null) ?? []);
          setLoaded(true);
        });
    };
    load();
    const channel = supabase
      .channel(`home-subscription-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "private", table: "app_credentials", filter: `owner_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    setActiveTab((current) => {
      if (creds.length === 0) return null;
      if (current && creds.some((c) => c.id === current)) return current;
      return creds[0].id;
    });
  }, [creds]);

  const copy = async (key: string, value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // ignore
    }
  };

  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
      timeZoneName: "short",
    });

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

  return (
    <div
      className="h-full rounded-2xl border-2 border-violet-500/60 bg-surface shadow-[0_0_30px_rgba(139,92,246,0.25)] overflow-hidden flex flex-col mx-auto"
      style={{ width: 300, maxWidth: "100%" }}
    >
      {/* Header */}
      <div className="relative shrink-0 aspect-[300/140] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.2),transparent_50%)]" />
        <div className="relative h-full flex flex-col items-center justify-center text-white p-4 text-center">
          <CalendarClock className="size-10 mb-2 drop-shadow" />
          <h3 className="font-display font-bold text-lg leading-tight drop-shadow">
            Your Subscription Details
          </h3>
          <p className="text-xs text-white/85 mt-1">
            {hasCreds ? `${creds.length} active account${creds.length === 1 ? "" : "s"}` : "No accounts assigned"}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-violet-500/60 to-transparent" />

      {/* Content */}
      <div className="min-h-0 flex-1 p-4 overflow-y-auto">
        {!hasCreds ? (
          <div className="text-center space-y-3 py-4">
            <p className="text-sm text-foreground/75">
              No subscription credentials have been assigned to you yet.
            </p>
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-to-br from-violet-600 to-blue-600 text-white text-sm font-medium shadow-[0_0_20px_rgba(139,92,246,0.45)] hover:opacity-90 transition"
            >
              <ShoppingBagMini className="size-4" />
              Browse plans
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {creds.length > 1 && activeTab && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                {creds.map((c, idx) => {
                  const selected = c.id === activeTab;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveTab(c.id)}
                      className={cn(
                        "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium border transition",
                        selected
                          ? "bg-violet-600 text-white border-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.45)]"
                          : "bg-surface-2 text-foreground/80 border-border hover:border-primary/60",
                      )}
                      title={c.app_login_name ?? `Sub ${idx + 1}`}
                    >
                      {formatTabLabel(c.app_login_name, idx)}
                    </button>
                  );
                })}
              </div>
            )}

            {(() => {
              const c = creds.find((x) => x.id === activeTab) ?? creds[0];
              const expired = c.expiry_at ? new Date(c.expiry_at).getTime() < Date.now() : false;
              const expSoon = c.expiry_at && !expired && new Date(c.expiry_at).getTime() - Date.now() < 7 * 86400_000;
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-border bg-surface-2 p-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-display font-semibold text-sm truncate">
                      {c.app_login_name ?? "Account"}
                    </div>
                    {c.expiry_at && (
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap",
                          expired
                            ? "text-destructive border-destructive/30 bg-destructive/10"
                            : expSoon
                              ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
                              : "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
                        )}
                      >
                        {expired ? "Expired" : expSoon ? "Expiring soon" : "Active"}
                      </span>
                    )}
                  </div>

                  {/* Login name */}
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <KeyRound className="size-3" /> Login name
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        type="text"
                        value={c.app_login_name ?? "—"}
                        className="flex-1 px-2 py-1 rounded-md bg-background border border-border text-xs"
                      />
                      <CopyButton
                        onClick={() => copy(`name-${c.id}`, c.app_login_name)}
                        copied={copied === `name-${c.id}`}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <KeyRound className="size-3" /> Password
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        type={reveal[c.id] ? "text" : "password"}
                        value={c.password ?? ""}
                        className="flex-1 px-2 py-1 rounded-md bg-background border border-border text-xs font-mono"
                      />
                      <button
                        onClick={() => setReveal((r) => ({ ...r, [c.id]: !r[c.id] }))}
                        className="p-1.5 rounded-md bg-background border border-border hover:border-primary"
                        title={reveal[c.id] ? "Hide" : "Reveal"}
                      >
                        {reveal[c.id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                      <CopyButton
                        onClick={() => copy(c.id, c.password)}
                        copied={copied === c.id}
                      />
                    </div>
                  </div>

                  {/* Expiry */}
                  {c.expiry_at && (
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <CalendarClock className="size-3" /> Expires
                      </p>
                      <p
                        className={cn(
                          "text-xs",
                          expired ? "text-destructive" : expSoon ? "text-amber-500" : "text-foreground",
                        )}
                      >
                        {fmt(new Date(c.expiry_at))}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            <Link
              to={username ? "/u/$username" : "/profile"}
              params={username ? { username } : undefined}
              search={username ? { tab: "creds" } : undefined}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-gradient-to-br from-violet-600 to-blue-600 text-white text-sm font-medium shadow-[0_0_20px_rgba(139,92,246,0.45)] hover:opacity-90 transition"
            >
              <ExternalLink className="size-4" />
              View subscription details
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function CopyButton({ onClick, copied }: { onClick: () => void; copied: boolean }) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 rounded-md bg-background border border-border hover:border-primary"
      title="Copy"
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function ShoppingBagMini({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
