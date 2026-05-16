import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

export function SubscriptionExpiry() {
  const { user } = useAuth();
  const [expiry, setExpiry] = useState<Date | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) { setExpiry(null); setLoaded(true); return; }
    let active = true;
    supabase
      .from("app_credentials")
      .select("expiry_at")
      .eq("owner_id", user.id)
      .not("expiry_at", "is", null)
      .order("expiry_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const v = (data as { expiry_at: string | null } | null)?.expiry_at ?? null;
        setExpiry(v ? new Date(v) : null);
        setLoaded(true);
      });
    return () => { active = false; };
  }, [user]);

  if (!loaded || !expiry) return null;

  const now = Date.now();
  const ms = expiry.getTime() - now;
  const expired = ms < 0;
  const soon = !expired && ms < 7 * 86400000;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatted = expiry.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  });

  return (
    <div
      title={`Subscription expiry: ${formatted}`}
      className={cn(
        "hidden md:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border",
        expired
          ? "bg-destructive/10 border-destructive/40 text-destructive"
          : soon
            ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
            : "bg-surface-2 border-border text-foreground",
      )}
    >
      <CalendarClock className="size-4 shrink-0" />
      <span>
        {expired ? "Your subscription expired on " : "Your subscription is due to expire on "}
        <span className="font-semibold">{formatted}</span>
      </span>
    </div>
  );
}
