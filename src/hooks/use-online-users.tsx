import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Shared presence store for "who is online".
 *
 * One singleton Supabase presence channel is shared by every consumer
 * (Supabase throws if presence callbacks are added after `subscribe()`), and
 * the state is published through `useSyncExternalStore` so every subscriber
 * re-renders the moment presence changes.
 *
 * Hardening (this kept silently breaking before):
 *  - the channel is re-subscribed when realtime errors, closes or times out,
 *  - presence is re-tracked on tab focus / visibility / network recovery,
 *  - a heartbeat re-tracks periodically so a dropped socket self-heals.
 */
let channel: RealtimeChannel | null = null;
let channelUid: string | null = null;
let refCount = 0;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 1000;
let listenersBound = false;
let currentState: Set<string> = new Set();
const listeners = new Set<() => void>();
const LAST_SEEN_PING_MS = 2 * 60_000;
const HEARTBEAT_MS = 25_000;
/** Keep someone shown as online briefly while a re-track / socket blip settles. */
const LINGER_MS = 10_000;
/** Wait before dropping the shared channel, so a remount does not blank dots. */
const TEARDOWN_GRACE_MS = 5_000;
const missingSince = new Map<string, number>();
let lingerTimer: ReturnType<typeof setTimeout> | null = null;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;


function getSnapshot() {
  return currentState;
}

function subscribeStore(cb: () => void) {
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

function setState(next: Set<string>) {
  // Skip no-op updates so we don't thrash renders.
  if (next.size === currentState.size) {
    let same = true;
    for (const id of next) {
      if (!currentState.has(id)) {
        same = false;
        break;
      }
    }
    if (same) return;
  }
  currentState = next;
  notify();
}

/**
 * Presence emits a leave+join pair whenever a client re-tracks or its socket
 * rejoins. Taking those raw would make the green dot blink off and on, so a
 * key that disappears is held for a short grace period and re-checked.
 */
function applyPresenceKeys(keys: string[]) {
  const now = Date.now();
  const next = new Set(keys);
  for (const id of next) missingSince.delete(id);
  let soonest = Number.POSITIVE_INFINITY;
  for (const id of currentState) {
    if (next.has(id)) continue;
    const since = missingSince.get(id) ?? now;
    missingSince.set(id, since);
    const remaining = LINGER_MS - (now - since);
    if (remaining > 0) {
      next.add(id);
      soonest = Math.min(soonest, remaining);
    } else {
      missingSince.delete(id);
    }
  }
  if (Number.isFinite(soonest)) {
    if (lingerTimer) clearTimeout(lingerTimer);
    lingerTimer = setTimeout(() => {
      lingerTimer = null;
      if (channel) applyPresenceKeys(Object.keys(channel.presenceState()));
    }, soonest + 50);
  }
  setState(next);
}


function pingLastSeen(uid: string) {
  try {
    supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", uid)
      .then(() => {}, () => {});
  } catch {
    /* ignore */
  }
}

async function track(uid: string) {
  if (!channel) return;
  try {
    await channel.track({ user_id: uid, online_at: new Date().toISOString() });
  } catch {
    /* ignore — heartbeat/retry will try again */
  }
}

function scheduleRetry(uid: string) {
  if (retryTimer) return;
  const delay = retryDelay;
  retryDelay = Math.min(retryDelay * 2, 15_000);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (channelUid !== uid || refCount <= 0) return;
    openChannel(uid);
  }, delay);
}

function openChannel(uid: string) {
  // Drop any previous socket for this user before opening a fresh one.
  if (channel) {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* ignore */
    }
    channel = null;
  }

  const ch = supabase.channel("presence:online", { config: { presence: { key: uid } } });
  const sync = () => {
    try {
      applyPresenceKeys(Object.keys(ch.presenceState()));
    } catch {
      /* ignore */
    }
  };
  ch.on("presence", { event: "sync" }, sync)
    .on("presence", { event: "join" }, sync)
    .on("presence", { event: "leave" }, sync)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        retryDelay = 1000;
        void track(uid);
        sync();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        scheduleRetry(uid);
      }
    });
  channel = ch;
}

function revive() {
  const uid = channelUid;
  if (!uid || refCount <= 0) return;
  const state = channel?.state;
  if (state !== "joined") {
    openChannel(uid);
    return;
  }
  // Do NOT re-track while the channel is healthy: every re-track emits a
  // synthetic leave+join to all other clients, which made status dots blink
  // between online and offline. The socket already maintains presence.
  const ch = channel;
  if (ch) {
    try {
      applyPresenceKeys(Object.keys(ch.presenceState()));
    } catch {
      /* ignore */
    }
  }
}


function bindWindowListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("focus", revive);
  window.addEventListener("online", revive);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") revive();
  });
}

function ensureChannel(uid: string) {
  if (channel && channelUid === uid) return;
  teardown();
  channelUid = uid;
  pingLastSeen(uid);
  pingInterval = setInterval(() => pingLastSeen(uid), LAST_SEEN_PING_MS);
  heartbeat = setInterval(revive, HEARTBEAT_MS);
  bindWindowListeners();
  openChannel(uid);
}

function teardown() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (channel) {
    if (channelUid) pingLastSeen(channelUid);
    try {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    } catch {
      /* ignore */
    }
    channel = null;
  }
  channelUid = null;
  setState(new Set());
}

export function useOnlineUsers(): Set<string> {
  const { user } = useAuth();
  const online = useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!user?.id) return;
    refCount++;
    ensureChannel(user.id);
    return () => {
      refCount--;
      if (refCount <= 0) {
        refCount = 0;
        teardown();
      }
    };
  }, [user?.id]);

  return online;
}
