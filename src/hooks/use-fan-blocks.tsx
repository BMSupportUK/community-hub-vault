import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/** Returns the set of user_ids the current user has blocked inside the fan zone. */
export function useFanBlocks() {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) {
      setBlocked(new Set());
      return;
    }
    const { data } = await supabase
      .from("fan_zone_blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id);
    setBlocked(new Set((data ?? []).map((r: { blocked_id: string }) => r.blocked_id)));
  }, [user?.id]);

  useEffect(() => {
    void load();
    if (!user) return;
    const ch = supabase
      .channel(`fz-blocks-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fan_zone_blocks", filter: `blocker_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, load]);

  return { blocked, reload: load, isBlocked: (id: string) => blocked.has(id) };
}