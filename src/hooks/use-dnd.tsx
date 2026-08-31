import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DndInfo = {
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  note: string | null;
  active: boolean;
};

type Row = {
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  note: string | null;
};

function computeActive(row: { enabled: boolean; starts_at: string | null; ends_at: string | null }): boolean {
  if (!row.enabled) return false;
  const now = Date.now();
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return false;
  if (row.ends_at && new Date(row.ends_at).getTime() <= now) return false;
  return true;
}

function toInfo(row: Row): DndInfo {
  return {
    enabled: row.enabled,
    startsAt: row.starts_at ? new Date(row.starts_at) : null,
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    note: row.note,
    active: computeActive(row),
  };
}

/**
 * One shared subscription + cached value per user, so every card, pill and
 * badge on the page reads the same live row instead of firing its own query
 * (which made later mounts render blank until their own fetch landed).
 */
type Store = {
  info: DndInfo | null;
  loaded: boolean;
  listeners: Set<(v: DndInfo | null) => void>;
  cleanup: () => void;
};

const stores = new Map<string, Store>();

function publish(store: Store) {
  for (const l of store.listeners) l(store.info);
}

function getStore(userId: string): Store {
  const existing = stores.get(userId);
  if (existing) return existing;

  const store: Store = { info: null, loaded: false, listeners: new Set(), cleanup: () => {} };
  stores.set(userId, store);

  const load = async () => {
    const { data } = await supabase
      .from("user_dnd_status")
      .select("enabled,starts_at,ends_at,note")
      .eq("user_id", userId)
      .maybeSingle();
    store.info = data ? toInfo(data as Row) : null;
    store.loaded = true;
    publish(store);
  };
  void load();

  const ch = supabase
    .channel(`dnd-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_dnd_status", filter: `user_id=eq.${userId}` },
      () => void load(),
    )
    .subscribe();

  // Roll windows over locally so the badge flips on/off at the boundary, and
  // resync whenever the tab regains focus (timers are throttled in background
  // tabs, which is what made the countdown look frozen until a page reload).
  const tick = setInterval(() => {
    if (!store.info) return;
    const active = computeActive({
      enabled: store.info.enabled,
      starts_at: store.info.startsAt ? store.info.startsAt.toISOString() : null,
      ends_at: store.info.endsAt ? store.info.endsAt.toISOString() : null,
    });
    if (active !== store.info.active) {
      store.info = { ...store.info, active };
      publish(store);
    }
  }, 5_000);

  const onVisible = () => {
    if (document.visibilityState === "visible") void load();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

  store.cleanup = () => {
    clearInterval(tick);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    void supabase.removeChannel(ch);
    stores.delete(userId);
  };

  return store;
}

/** Subscribe to a single user's DND status with realtime updates. */
export function useDndStatus(userId: string | null | undefined): DndInfo | null {
  const [info, setInfo] = useState<DndInfo | null>(() =>
    userId ? (stores.get(userId)?.info ?? null) : null,
  );

  useEffect(() => {
    if (!userId) {
      setInfo(null);
      return;
    }
    const store = getStore(userId);
    store.listeners.add(setInfo);
    setInfo(store.info);

    return () => {
      store.listeners.delete(setInfo);
      if (store.listeners.size === 0) {
        // Keep the cached value around briefly so route changes reuse it.
        setTimeout(() => {
          if (store.listeners.size === 0) store.cleanup();
        }, 30_000);
      }
    };
  }, [userId]);

  return info;
}
