import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

type Cred = { app_login_name: string | null; expiry_at: string | null };

export function SubscriptionExpiry() {
  const { user } = useAuth();
  const [creds, setCreds] = useState<Cred[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) { setCreds([]); setLoaded(true); return; }
    let active = true;
    const load = () => {
      supabase
        .from("app_credentials")
        .select("app_login_name, expiry_at")
        .eq("owner_id", user.id)
        .not("expiry_at", "is", null)
        .order("expiry_at", { ascending: false })
        .then(({ data }) => {
          if (!active) return;
          setCreds((data as Cred[] | null) ?? []);
          setLoaded(true);
        });
    };
    load();
    const channel = supabase
      .channel(`app_credentials-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_credentials", filter: `owner_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [user]);

  const items = creds.filter((c) => c.expiry_at);
  if (!loaded || items.length === 0) return null;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: tz, timeZoneName: "short",
    });

  // Worst state across creds drives pill color
  const now = Date.now();
  const states = items.map((c) => {
    const ms = new Date(c.expiry_at!).getTime() - now;
    return { expired: ms < 0, soon: ms >= 0 && ms < 7 * 86400000 };
  });
  const anyExpired = states.some((s) => s.expired);
  const anySoon = !anyExpired && states.some((s) => s.soon);

  return (
    <div
      title={items.map((c) => `${c.app_login_name ?? "Account"}: ${fmt(new Date(c.expiry_at!))}`).join("\n")}
      className={cn(
        "hidden md:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border max-w-[640px]",
        anyExpired
          ? "bg-destructive/10 border-destructive/40 text-destructive"
          : anySoon
            ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
            : "bg-surface-2 border-border text-foreground",
      )}
    >
      <CalendarClock className="size-4 shrink-0" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {items.map((c, i) => {
          const d = new Date(c.expiry_at!);
          const expired = d.getTime() < now;
          return (
            <span key={i} className="whitespace-nowrap">
              {c.app_login_name && (
                <span className="font-semibold mr-1">{c.app_login_name} Your Account:</span>
              )}
              {expired ? "expired on " : "expires on "}
              <span className="font-semibold">{fmt(d)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
