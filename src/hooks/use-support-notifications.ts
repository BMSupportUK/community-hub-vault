import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useInFanZoneChrome } from "@/lib/sports-guides-origin";
import { supportNotificationsEnabled } from "@/lib/support-notification-scope";

export function useSupportNotifications() {
  const { isFanZoneOnly } = useAuth();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const inFanZone = useInFanZoneChrome(path, isFanZoneOnly);
  return supportNotificationsEnabled(isFanZoneOnly, inFanZone);
}