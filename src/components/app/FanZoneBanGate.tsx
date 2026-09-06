import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneBan } from "@/hooks/use-fan-zone-ban";
import { FanZoneBannedScreen } from "@/components/app/FanZoneBannedScreen";
import { IconRail } from "@/components/app/IconRail";
import { FanZonePublicHeader } from "@/components/app/FanZonePublicHeader";

/** Keeps the Fan Zone side rail and header around the ban notice. */
function BanChrome({ children }: { children: ReactNode }) {
  return (
    <div className="boro-theme flex min-h-screen bg-background">
      <IconRail />
      <div className="min-w-0 flex-1 overflow-y-auto scrollbar-hide">
        <FanZonePublicHeader />
        {children}
      </div>
    </div>
  );
}

/**
 * Blocks every Boro Fan Zone page for a banned member: they see the ban
 * screen instead of any Fan Zone content until the ban lifts.
 *
 * Nothing is rendered until BOTH the sign-in state and the ban check have
 * settled, and once a ban is known the screen stays put through background
 * re-checks — otherwise the page flickers between the content and the ban box.
 *
 * When the ban is lifted the gate keeps the ban screen visible with a
 * "Continue to the Fan Zone" button, so the customer chooses when to leave
 * instead of being auto-redirected.
 */
export function FanZoneBanGate({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { ban, loading } = useFanZoneBan(user?.id ?? null);
  const [lifted, setLifted] = useState(false);

  // Sticky: keep showing the ban screen while a later check is in flight.
  const lastBan = useRef<typeof ban>(null);
  useEffect(() => {
    if (!loading) lastBan.current = ban;
  }, [ban, loading]);

  // Detect a ban being lifted while the customer is on the page.
  const wasBanned = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (ban) {
      wasBanned.current = true;
      if (lifted) setLifted(false);
    } else if (wasBanned.current && !lifted) {
      setLifted(true);
    }
  }, [ban, loading, lifted]);

  const settled = !authLoading && !loading;
  const effectiveBan = loading ? (lastBan.current ?? ban) : ban;

  if (effectiveBan) {
    return (
      <BanChrome>
        <FanZoneBannedScreen
          expiresAt={effectiveBan.expires_at}
          reason={effectiveBan.reason}
          bannedBy={effectiveBan.banned_by_name}
          returnTo="/home"
        />
      </BanChrome>
    );
  }

  if (lifted) {
    return (
      <BanChrome>
        <FanZoneBannedScreen
          expiresAt={null}
          reason=""
          bannedBy={null}
          returnTo="/home"
          lifted
          onContinue={() => setLifted(false)}
        />
      </BanChrome>
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
