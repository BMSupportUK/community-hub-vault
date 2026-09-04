import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Single shared presence channel for "who is in the Boro Fan Zone".
 *
 * Supabase reuses one channel instance per topic, and callbacks cannot be added
 * after `subscribe()`. Several components (the online counter in the hero and
 * the sidebar, the staff box) need this presence at once, so the channel is
 * created exactly once here, ref-counted, and every consumer just gets a
 * snapshot through a listener.
 */

type Snapshot = { keys: string[] };

let channel: RealtimeChannel | null = null;
let refs = 0;
let selfKey: string | null = null;
let selfIsGuest = false;
let snapshot: Snapshot = { keys: [] };
const listeners = new Set<(s: Snapshot) => void>();

function emit() {
  for (const fn of listeners) fn(snapshot);
}

function sync() {
  if (!channel) return;
  const state = channel.presenceState() as Record<string, unknown[]>;
  const keys = Object.keys(state);
  const same = keys.length === snapshot.keys.length && keys.every((k) => snapshot.keys.includes(k));
  if (same) return;
  snapshot = { keys };
  emit();
}

function ensureChannel() {
  if (channel) return channel;
  selfKey = selfKey ?? `anon-${Math.random().toString(36).slice(2, 10)}`;
  const ch = supabase.channel("presence:fanzone-online", {
    config: { presence: { key: selfKey } },
  });
  channel = ch;
  ch.on("presence", { event: "sync" }, sync)
    .on("presence", { event: "join" }, sync)
    .on("presence", { event: "leave" }, sync)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        ch.track({ guest: selfIsGuest, at: new Date().toISOString() }).catch(() => {});
      }
    });
  return ch;
}

/** Set who we are before/while joined. Re-tracks when the identity changes. */
export function setFanZonePresenceIdentity(userId: string | null) {
  const nextKey = userId ?? selfKey ?? `guest-${Math.random().toString(36).slice(2, 10)}`;
  const nextGuest = !userId;
  if (nextKey === selfKey && nextGuest === selfIsGuest) return;
  selfKey = nextKey;
  selfIsGuest = nextGuest;
  if (channel) {
    // The presence key is fixed at channel creation, so rebuild on identity change.
    const had = refs;
    teardown();
    refs = had;
    if (refs > 0) ensureChannel();
  }
}

function teardown() {
  if (channel) {
    const ch = channel;
    channel = null;
    ch.untrack().catch(() => {});
    supabase.removeChannel(ch);
  }
  snapshot = { keys: [] };
}

/** Subscribe to the shared presence snapshot. Returns an unsubscribe fn. */
export function subscribeFanZonePresence(fn: (s: Snapshot) => void): () => void {
  listeners.add(fn);
  refs += 1;
  ensureChannel();
  fn(snapshot);
  return () => {
    listeners.delete(fn);
    refs = Math.max(0, refs - 1);
    if (refs === 0) {
      teardown();
      emit();
    }
  };
}
