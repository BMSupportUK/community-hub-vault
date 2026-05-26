import { useEffect, useState } from "react";
import { CalendarClock, BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { cn } from "@/lib/utils";

type Cred = { app_login_name: string | null; expiry_at: string | null };

export function MembershipBox() {
  const { user, refreshRoles, isStaff } = useAuth();
  const tz = useUserTimezone();
  const [creds, setCreds] = useState<Cred[]>([]);
  const [loaded, setLoaded] = useState(false);

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
      .channel(`membership-box-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "private", table: "app_credentials", filter: `owner_id=eq.${user.id}` },
        () => load(),
      );
    channel.subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const items = creds.filter((c) => c.expiry_at);

  useScheduledRevoke(isStaff ? [] : items, user?.id, refreshRoles);

  if (!loaded || items.length === 0) return null;

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

  const now = Date.now();
  const anyExpired = items.some((c) => new Date(c.expiry_at!).getTime() < now);

  return (
    <section className="px-2 pt-4">
      <div className={cn("rounded-lg bg-surface-2/60 border border-border overflow-hidden", anyExpired && "membership-expired-flash")}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-gradient-to-r from-violet-600/10 via-fuchsia-600/10 to-blue-600/10">
          <div className="flex items-center gap-2">
            <BadgeCheck className="size-3.5 text-violet-300" />
            <h2 className="font-display text-[11px] font-bold tracking-wider uppercase">Membership</h2>
          </div>
        </div>
        <ul className="px-3 py-3 space-y-2">
          {items.map((c, i) => {
            const d = new Date(c.expiry_at!);
            const ms = d.getTime() - now;
            const expired = ms < 0;
            const soon = !expired && ms < 7 * 86400000;
            const dotClass = expired
              ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]"
              : soon
                ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
                : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]";
            const textClass = expired
              ? "text-red-300"
              : soon
                ? "text-amber-300"
                : "text-emerald-300";
            return (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={cn("mt-1 size-2 rounded-full shrink-0", dotClass)} />
                <div className="min-w-0 flex-1">
                  {c.app_login_name && (
                    <div className="font-semibold text-foreground truncate flex items-center gap-1">
                      <CalendarClock className="size-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{c.app_login_name}</span>
                    </div>
                  )}
                  <div className={cn("text-[11px] font-medium", textClass)}>
                    {expired ? "Expired " : "Expires "}
                    <span className="font-semibold">{fmt(d)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function useScheduledRevoke(
  items: { expiry_at: string | null }[],
  userId: string | undefined,
  onRevoked?: () => void | Promise<void>,
) {
  useEffect(() => {
    if (!userId || items.length === 0) return;
    const times = items
      .map((c) => (c.expiry_at ? new Date(c.expiry_at).getTime() : 0))
      .filter((t) => t > 0);
    if (times.length === 0) return;
    const latest = Math.max(...times);
    const delay = latest - Date.now();
    const fire = () => {
      supabase.rpc("revoke_expired_subscriber_role", { _user_id: userId }).then(() => {
        onRevoked?.();
      });
    };
    if (delay <= 0) {
      fire();
      return;
    }
    const t = setTimeout(fire, Math.min(delay + 500, 2_000_000_000));
    return () => clearTimeout(t);
  }, [items, userId, onRevoked]);
}