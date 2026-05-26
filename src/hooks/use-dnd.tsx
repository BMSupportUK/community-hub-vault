import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DndInfo = {
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  note: string | null;
  active: boolean;
};

function computeActive(row: {
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
}): boolean {
  if (!row.enabled) return false;
  const now = Date.now();
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return false;
  if (row.ends_at && new Date(row.ends_at).getTime() <= now) return false;
  return true;
}

function toInfo(row: {
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  note: string | null;
}): DndInfo {
  return {
    enabled: row.enabled,
    startsAt: row.starts_at ? new Date(row.starts_at) : null,
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    note: row.note,
    active: computeActive(row),
  };
}

/** Subscribe to a single user's DND status with realtime updates. */
export function useDndStatus(userId: string | null | undefined): DndInfo | null {
  const [info, setInfo] = useState<DndInfo | null>(null);

  useEffect(() => {
    if (!userId) {
      setInfo(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("user_dnd_status")
        .select("enabled,starts_at,ends_at,note")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setInfo(data ? toInfo(data) : null);
    };
    load();

    const ch = supabase
      .channel(`dnd-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_dnd_status", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();

    // Roll over time windows once a minute even without DB changes.
    const tick = setInterval(() => {
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              active: computeActive({
                enabled: prev.enabled,
                starts_at: prev.startsAt ? prev.startsAt.toISOString() : null,
                ends_at: prev.endsAt ? prev.endsAt.toISOString() : null,
              }),
            }
          : prev,
      );
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(tick);
      supabase.removeChannel(ch);
    };
  }, [userId]);

  return info;
}