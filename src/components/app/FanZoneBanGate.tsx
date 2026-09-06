import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneBan } from "@/hooks/use-fan-zone-ban";
import { FanZoneBannedScreen } from "@/components/app/FanZoneBannedScreen";

/**
 * Blocks every Boro Fan Zone page for a banned member: they see the ban
 * screen instead of any Fan Zone content until the ban lifts.
 */
export function FanZoneBanGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { ban, loading } = useFanZoneBan(user?.id ?? null);

  if (ban && !loading) {
    return (
      <div className="boro-theme relative w-full min-h-screen overflow-y-auto scrollbar-hide">
        <FanZoneBannedScreen
          expiresAt={ban.expires_at}
          reason={ban.reason}
          bannedBy={ban.banned_by_name}
          returnTo="/home"
        />
      </div>
    );
  }

  return <>{children}</>;
}
