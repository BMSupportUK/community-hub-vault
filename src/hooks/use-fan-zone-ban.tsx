import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FanZoneBan = {
  id: string;
  user_id: string;
  reason: string;
  /** null = permanent ban. */
  expires_at: string | null;
  banned_by: string | null;
  banned_by_name: string | null;
  created_at: string;
};

/**
 * The live Boro Fan Zone ban for a member, or null when they can enter.
 * Kept entirely separate from BM Support account bans.
 * Members can read their own ban; Fan Zone staff can read anyone's.
 */
export function useFanZoneBan(userId: string | null | undefined) {
  const [ban, setBan] = useState<FanZoneBan | null>(null);
  const [loading, setLoading] = useState(!!userId);

  const refresh = useCallback(async () => {
    if (!userId) {
      setBan(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase.rpc("fan_zone_active_ban", { _user_id: userId });
    const row = ((data ?? []) as FanZoneBan[])[0] ?? null;
    const live = row && (row.expires_at === null || Date.parse(row.expires_at) > Date.now());
    setBan(live ? row : null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(!!userId);
    void refresh();
  }, [refresh, userId]);

  // Release the screen automatically the moment a timed ban expires.
  useEffect(() => {
    if (!ban || !ban.expires_at) return;
    const ms = Date.parse(ban.expires_at) - Date.now();
    if (ms <= 0) {
      setBan(null);
      return;
    }
    const t = setTimeout(() => void refresh(), Math.min(ms + 500, 2_147_000_000));
    return () => clearTimeout(t);
  }, [ban, refresh]);

  return { ban, loading, refresh };
}
