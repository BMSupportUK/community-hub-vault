import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

/**
 * Boro Fan Zone friend requests — completely separate from the BM Support
 * friends system (`friendships` / FriendRequestsListener).
 *
 * Incoming requests are handled exclusively in the Friend Requests inbox
 * (/fanzone/friend-requests) — no popups. This listener only notifies the
 * requester when one of their sent requests gets accepted.
 */
export function FanZoneFriendRequestsListener() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const ch = supabase
      .channel(`fanzone-friendships:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "fan_zone_friendships", filter: `requester_id=eq.${user.id}` },
        async (p) => {
          const row = p.new as { addressee_id: string; status: string };
          const old = p.old as { status?: string };
          if (row.status !== "accepted" || old?.status === "accepted") return;
          const { data: aliasRows } = await supabase.rpc("fan_zone_aliases", { _ids: [row.addressee_id] });
          const m = (aliasRows ?? [])[0] as { fan_alias: string | null } | undefined;
          toast.success(`${m?.fan_alias?.trim() || "A Boro fan"} accepted your Fan Zone friend request`, {
            action: {
              label: "View profile",
              onClick: () => navigate({ to: "/fanzone/u/$userId", params: { userId: row.addressee_id } }),
            },
          });
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
