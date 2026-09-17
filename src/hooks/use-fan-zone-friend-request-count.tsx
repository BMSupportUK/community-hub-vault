import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Number of pending Boro Fan Zone friend requests waiting for the signed-in
 * fan to accept or decline. Kept separate from the BM Support friends system.
 */
export function useFanZoneFriendRequestCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { count: c } = await supabase
        .from("fan_zone_friendships")
        .select("id", { count: "exact", head: true })
        .eq("addressee_id", user.id)
        .eq("status", "pending");
      if (!cancelled) setCount(c ?? 0);
    };
    void load();
    const ch = supabase
      .channel(`fanzone-friend-req-count:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fan_zone_friendships" }, () => void load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  return count;
}
