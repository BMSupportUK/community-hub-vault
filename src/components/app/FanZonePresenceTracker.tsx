import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { isFanZonePath } from "@/lib/fan-zone-nav";
import { setFanZonePresenceIdentity, subscribeFanZonePresence } from "@/lib/fan-zone-presence";

/**
 * Joins the shared Fan Zone presence channel for ANY Fan Zone section
 * (boards, fantasy, score predictions, competition winners, admin fan zone),
 * not just pages that happen to render the online counter.
 */
export function FanZonePresenceTracker() {
  const { user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const inFanZone = isFanZonePath(path);

  useEffect(() => {
    if (!inFanZone) return;
    setFanZonePresenceIdentity(user?.id ?? null);
    return subscribeFanZonePresence(() => {});
  }, [inFanZone, user?.id]);

  return null;
}
