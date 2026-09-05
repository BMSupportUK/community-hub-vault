import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FanZoneMute = {
  id: string;
  user_id: string;
  reason: string;
  expires_at: string;
  muted_by: string | null;
  muted_by_name: string | null;
  created_at: string;
};

/**
 * The live Boro Fan Zone mute for a member, or null when they can post.
 * Members can read their own mute; moderators can read anyone's.
 * Re-checks itself when the countdown runs out so the screen releases
 * without a page refresh.
 */
export function useFanZoneMute(userId: string | null | undefined) {
  const [mute, setMute] = useState<FanZoneMute | null>(null);
  const [loading, setLoading] = useState(!!userId);

  const refresh = useCallback(async () => {
    if (!userId) {
      setMute(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase.rpc("fan_zone_active_mute", { _user_id: userId });
    const row = ((data ?? []) as FanZoneMute[])[0] ?? null;
    setMute(row && Date.parse(row.expires_at) > Date.now() ? row : null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(!!userId);
    void (async () => {
      if (cancelled) return;
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, userId]);

  // Clear the mute automatically the moment it expires.
  useEffect(() => {
    if (!mute) return;
    const ms = Date.parse(mute.expires_at) - Date.now();
    if (ms <= 0) {
      setMute(null);
      return;
    }
    const t = setTimeout(() => void refresh(), Math.min(ms + 500, 2_147_000_000));
    return () => clearTimeout(t);
  }, [mute, refresh]);

  return { mute, loading, refresh };
}
