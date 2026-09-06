import { useEffect, useRef, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneBan } from "@/hooks/use-fan-zone-ban";
import { FanZoneBannedScreen } from "@/components/app/FanZoneBannedScreen";

/**
 * Blocks every Boro Fan Zone page for a banned member: they see the ban
 * screen instead of any Fan Zone content until the ban lifts.
 *
 * Nothing is rendered until BOTH the sign-in state and the ban check have
 * settled, and once a ban is known the screen stays put through background
 * re-checks — otherwise the page flickers between the content and the ban box.
 */
export function FanZoneBanGate({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { ban, loading } = useFanZoneBan(user?.id ?? null);

  // Sticky: keep showing the ban screen while a later check is in flight.
  const lastBan = useRef<typeof ban>(null);
  useEffect(() => {
    if (!loading) lastBan.current = ban;
  }, [ban, loading]);

  const settled = !authLoading && !loading;
  const effectiveBan = loading ? (lastBan.current ?? ban) : ban;

  if (effectiveBan) {
    return (
      <div className="boro-theme relative w-full min-h-screen overflow-y-auto scrollbar-hide">
        <FanZoneBannedScreen
          expiresAt={effectiveBan.expires_at}
          reason={effectiveBan.reason}
          bannedBy={effectiveBan.banned_by_name}
          returnTo="/home"
        />
      </div>
    );
  }

  // First check still running: show a quiet placeholder rather than the page,
  // so a banned member never sees the Fan Zone flash up behind the ban box.
  if (!settled) {
    return (
      <div className="boro-theme relative w-full min-h-screen grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
