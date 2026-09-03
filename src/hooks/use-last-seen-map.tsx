import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live "last active" timestamps for a set of users.
 *
 * Seeds from `profiles.last_seen_at`, then keeps the map fresh in real time by
 * listening for profile updates. A slow tick is exposed so consumers can
 * re-render relative labels ("5m ago") without refetching.
 */
export function useLastSeenMap(userIds: string[]): {
  lastSeen: Record<string, string | null>;
  tick: number;
} {
  const key = useMemo(() => Array.from(new Set(userIds)).sort().join(","), [userIds]);
  const [lastSeen, setLastSeen] = useState<Record<string, string | null>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setLastSeen({});
      return;
    }
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.from("profiles").select("id,last_seen_at").in("id", ids);
      if (cancelled) return;
      const next: Record<string, string | null> = {};
      for (const row of (data ?? []) as Array<{ id: string; last_seen_at: string | null }>) {
        next[row.id] = row.last_seen_at;
      }
      setLastSeen(next);
    })();

    const idSet = new Set(ids);
    const channel = supabase
      .channel(`last-seen:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const row = payload.new as { id?: string; last_seen_at?: string | null };
          if (!row?.id || !idSet.has(row.id)) return;
          setLastSeen((prev) =>
            prev[row.id!] === (row.last_seen_at ?? null)
              ? prev
              : { ...prev, [row.id!]: row.last_seen_at ?? null },
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [key]);

  return { lastSeen, tick };
}
