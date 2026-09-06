import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { setFanZonePresenceIdentity, subscribeFanZonePresence } from "@/lib/fan-zone-presence";

const STAFF_ROLES = ["admin", "management", "moderator", "boro_fan_zone_moderator"];

/**
 * Live "online now" counter for the Fan Zone sidebar.
 * Reads the shared Fan Zone presence channel (separate from the app shell
 * presence) so guests are counted too, and several copies can render at once.
 */
export function OnlineNowBox({ variant = "panel" }: { variant?: "panel" | "hero" }) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [signedIn, setSignedIn] = useState<string[]>([]);
  const [staffIds, setStaffIds] = useState<string[]>([]);

  useEffect(() => {
    setFanZonePresenceIdentity(user?.id ?? null);
    return subscribeFanZonePresence(({ keys }) => {
      setCount(keys.length);
      setSignedIn(keys.filter((k) => !k.startsWith("guest-") && !k.startsWith("anon-")));
    });
  }, [user?.id]);

  // Work out which of the signed-in people online are staff.
  useEffect(() => {
    if (!user || signedIn.length === 0) {
      setStaffIds([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", signedIn)
        .in("role", STAFF_ROLES);
      if (cancelled) return;
      setStaffIds([...new Set((data ?? []).map((r) => r.user_id as string))]);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, signedIn.join(",")]);

  const staff = staffIds.filter((id) => signedIn.includes(id)).length;
  const members = Math.max(0, signedIn.length - staff);
  const guests = Math.max(0, count - signedIn.length);
  const breakdown = `${staff} staff · ${members} member${members === 1 ? "" : "s"} · ${guests} guest${guests === 1 ? "" : "s"}`;


  if (variant === "hero") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border border-white/30 bg-black/40 px-3.5 py-1.5 text-white backdrop-blur-sm shadow-lg shadow-black/20",
        )}
        title="Members and guests browsing the Fan Zone"
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-semibold tracking-wide">
          {count} {count === 1 ? "person" : "people"} online
        </span>
        <span className="hidden sm:inline text-[10px] text-white/70">
          {members} signed in · {guests} guest{guests === 1 ? "" : "s"}
        </span>
      </div>
    );
  }

  return (
    <section className="boro-inner-panel rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider font-bold text-[#E11B22] flex items-center gap-1">
          <Users className="size-3" /> Online now
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)] animate-pulse" />
          Live
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-2xl font-display font-bold text-emerald-400 leading-none tabular-nums">
          {count}
        </span>
        <span className="text-[10px] text-muted-foreground leading-tight">
          {count === 1 ? "person browsing" : "people browsing"}
          <br />
          {members} signed in · {guests} guest{guests === 1 ? "" : "s"}
        </span>
      </div>
    </section>
  );
}
