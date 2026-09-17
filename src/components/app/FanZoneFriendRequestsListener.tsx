import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Boro Fan Zone friend requests — completely separate from the BM Support
 * friends system (`friendships` / FriendRequestsListener).
 *
 * Incoming requests are handled exclusively in the Friend Requests inbox
 * (/fanzone/friend-requests) — no popups or acceptance messages.
 */
export function FanZoneFriendRequestsListener() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;

    const ch = supabase
      .channel(`fanzone-friendships:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "fan_zone_friendships", filter: `requester_id=eq.${user.id}` },
        (p) => {
          const row = p.new as { status: string };
          const old = p.old as { status?: string };
          if (row.status !== "accepted" || old?.status === "accepted") return;
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return null;
}
