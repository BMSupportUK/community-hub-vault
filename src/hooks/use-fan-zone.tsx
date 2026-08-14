import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { onFanAliasChange } from "@/lib/fan-alias-bus";

export type FanZoneStatus = "none" | "pending" | "approved" | "rejected" | "revoked";

export type FanZoneInfo = {
  status: FanZoneStatus;
  note: string | null;
  reason: string | null;
  decidedAt: Date | null;
  fanAlias: string | null;
  fanAvatarUrl: string | null;
  bio: string | null;
  supporterSince: number | null;
  favPlayer: string | null;
  matchdayMemory: string | null;
};

/**
 * Subscribe to the current user's Boro Fan Zone membership row.
 * `loading` stays true until the first fetch resolves so callers don't act on
 * a momentary "no data" state (which flashed the display-name prompt on load).
 */
export function useFanZoneMembershipState(userId: string | null | undefined): {
  info: FanZoneInfo | null;
  loading: boolean;
} {
  const [info, setInfo] = useState<FanZoneInfo | null>(null);
  const [loading, setLoading] = useState(!!userId);

  useEffect(() => {
    if (!userId) {
      setInfo(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const { data } = await supabase
        .from("fan_zone_members")
        .select("status, note, reason, decided_at, fan_alias, fan_avatar_url, bio, supporter_since, fav_player, matchday_memory")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setInfo({
        status: (data?.status as FanZoneStatus) ?? "none",
        note: data?.note ?? null,
        reason: data?.reason ?? null,
        decidedAt: data?.decided_at ? new Date(data.decided_at) : null,
        fanAlias: (data?.fan_alias as string | null) ?? null,
        fanAvatarUrl: (data?.fan_avatar_url as string | null) ?? null,
        bio: (data?.bio as string | null) ?? null,
        supporterSince: (data?.supporter_since as number | null) ?? null,
        favPlayer: (data?.fav_player as string | null) ?? null,
        matchdayMemory: (data?.matchday_memory as string | null) ?? null,
      });
      setLoading(false);
    };
    void load();

    const offLocal = onFanAliasChange(() => void load());
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
      offLocal();
      supabase.removeChannel(ch);
    };
  }, [userId]);

  return { info, loading };
}

/** Convenience wrapper for callers that only need the row. */
export function useFanZoneMembership(userId: string | null | undefined): FanZoneInfo | null {
  return useFanZoneMembershipState(userId).info;
}