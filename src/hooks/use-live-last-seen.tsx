import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live "last active" timestamps, shared by every card on the page.
 *
 * One singleton realtime subscription watches `profiles` updates and records
 * each user's `last_seen_at`, so member/staff cards move from "12m ago" to
 * "now" as people navigate the site — without one channel per row.
 *
 * Consumers pass the value they already fetched as a seed; the live value wins
 * as soon as an update arrives.
 */
let channel: ReturnType<typeof supabase.channel> | null = null;
let refCount = 0;
let state: Map<string, string | null> = new Map();
const listeners = new Set<() => void>();

function getSnapshot() {
  return state;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  for (const fn of Array.from(listeners)) {
    try {
      fn();
    } catch {
      /* never let one subscriber break the rest */
    }
  }
}

function open() {
  if (channel) return;
  channel = supabase
    .channel("last-seen:shared")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles" },
      (payload) => {
        const row = payload.new as { id?: string; last_seen_at?: string | null };
        if (!row?.id) return;
        const value = row.last_seen_at ?? null;
        if (state.get(row.id) === value) return;
        const next = new Map(state);
        next.set(row.id, value);
        state = next;
        notify();
      },
    )
    .subscribe();
}

function close() {
  if (channel) {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* ignore */
    }
    channel = null;
  }
  if (state.size) {
    state = new Map();
    notify();
  }
}

/**
 * Latest known `last_seen_at` for a user, falling back to the seed value.
 * The returned `tick` changes every 30s so relative labels stay current.
 */
export function useLiveLastSeen(
  userId: string | null | undefined,
  seed: string | null | undefined,
): { lastSeenAt: string | null; tick: number } {
  const map = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    refCount++;
    open();
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => {
      clearInterval(t);
      refCount--;
      if (refCount <= 0) {
        refCount = 0;
        close();
      }
    };
  }, []);

  const live = userId ? map.get(userId) : undefined;
  return { lastSeenAt: live !== undefined ? live : seed ?? null, tick };
}
