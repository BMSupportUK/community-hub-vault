import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FanZoneStatus = "none" | "pending" | "approved" | "rejected" | "revoked";

export type FanZoneInfo = {
  status: FanZoneStatus;
  note: string | null;
  reason: string | null;
  decidedAt: Date | null;
};

/** Subscribe to the current user's Boro Fan Zone membership row. */
export function useFanZoneMembership(userId: string | null | undefined): FanZoneInfo | null {
  const [info, setInfo] = useState<FanZoneInfo | null>(null);

  useEffect(() => {
    if (!userId) {
      setInfo(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("fan_zone_members")
        .select("status, note, reason, decided_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setInfo({
        status: (data?.status as FanZoneStatus) ?? "none",
        note: data?.note ?? null,
        reason: data?.reason ?? null,
        decidedAt: data?.decided_at ? new Date(data.decided_at) : null,
      });
    };
    void load();

    const ch = supabase
      .channel(`fan-zone-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fan_zone_members", filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [userId]);

  return info;
}