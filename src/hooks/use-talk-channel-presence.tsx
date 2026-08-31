import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const TALK_PRESENCE_TOPIC = "presence:talk-channels";

type TalkPresence = {
  user_id?: string;
  channel_id?: string;
  online_at?: string;
};

/**
 * Presences older than this are treated as gone (dropped tab / dead socket).
 * Generous vs. the heartbeat so a throttled background tab or a slow phone
 * never gets dropped and re-added — that churn is what made counts flicker.
 */
const STALE_MS = 120_000;
/** How often the local presence timestamp is refreshed while in a channel. */
const HEARTBEAT_MS = 20_000;
/** Counts settle for this long before publishing, so bursts land as one update. */
const PUBLISH_DEBOUNCE_MS = 250;
/**
 * A user keeps their online badge for this long after vanishing from presence
 * state. Every heartbeat re-`track()` emits leave+join on other clients, and a
 * socket re-join momentarily empties one key — without this grace window those
 * blips made people appear to go offline and come straight back.
 */
const LINGER_MS = 5_000;

type Tracker = {
  userId: string;
  channelId: string;
};

let sharedChannel: RealtimeChannel | null = null;
let subscribed = false;
let trackedSignature = "";
let currentCount = 0;
let currentUserIds: Set<string> = new Set();
const connectionId = crypto.randomUUID();
const listeners = new Set<(count: number) => void>();
const userListeners = new Set<(ids: Set<string>) => void>();
const trackers = new Map<symbol, Tracker>();
let memberIds: Set<string> = new Set();
let knownDirectoryIds: Set<string> = new Set();
let memberDirectoryLoaded = false;
let memberDirectoryRequest: Promise<void> | null = null;
let memberDirectoryLoadedAt = 0;
const DIRECTORY_MIN_INTERVAL_MS = 30_000;
const memberListeners = new Set<() => void>();

async function loadMemberDirectory(force = false) {
  if (memberDirectoryRequest) return memberDirectoryRequest;
  if (!force && Date.now() - memberDirectoryLoadedAt < DIRECTORY_MIN_INTERVAL_MS) return;
  memberDirectoryRequest = (async () => {
    const { data, error } = await supabase.rpc("talk_channel_member_directory");
    if (error) {
      console.error("Could not load Talk Channel member directory", error);
      return;
    }
    const excludedRoles = new Set([
      "admin",
      "management",
      "moderator",
      "staff",
      "pending",
      "banned",
      "rejected",
    ]);
    memberIds = new Set(
      (data ?? [])
        .filter((row) => !(row.roles ?? []).some((role) => excludedRoles.has(role)))
        .map((row) => row.user_id),
    );
    knownDirectoryIds = new Set((data ?? []).map((row) => row.user_id));
    memberDirectoryLoaded = true;
    memberDirectoryLoadedAt = Date.now();
    for (const listener of Array.from(memberListeners)) listener();
  })().finally(() => {
    memberDirectoryRequest = null;
  });
  return memberDirectoryRequest;
}

/**
 * Last time we saw a heartbeat for a presence key, measured on *this* device's
 * clock. Remote `online_at` stamps come from other machines, whose clocks can
 * be minutes out — comparing them to our clock made healthy sessions look
 * stale (or immortal), which is a classic count-flicker cause.
 */
const lastSeenLocal = new Map<string, number>();
/** First moment a previously visible user vanished from presence state. */
const missingSince = new Map<string, number>();
let lingerTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLingerFlush(delay: number) {
  if (lingerTimer) clearTimeout(lingerTimer);
  lingerTimer = setTimeout(() => {
    lingerTimer = null;
    flushCount();
  }, Math.max(0, delay) + 25);
}

function collectUniqueUsers(channel: RealtimeChannel): Set<string> {
  const state = channel.presenceState<TalkPresence>();
  const userIds = new Set<string>();
  const now = Date.now();
  const cutoff = now - STALE_MS;
  const liveKeys = new Set<string>();
  const activeTracker = Array.from(trackers.values()).at(-1);

  for (const [key, presences] of Object.entries(state)) {
    for (const presence of presences) {
      if (!presence.user_id) continue;
      // The realtime client can retain this connection's last tracked payload
      // in presenceState() after untrack resolves. Never let that stale local
      // payload keep the rail count high once the channel route has unmounted.
      if (key === connectionId && !activeTracker) continue;
      const seenKey = `${key}:${presence.user_id}`;
      liveKeys.add(seenKey);
      const previous = lastSeenLocal.get(seenKey);
      const stamp = presence.online_at ?? "";
      const prevStamp = presenceStamps.get(seenKey);
      if (previous === undefined || stamp !== prevStamp) {
        // First sighting, or a fresh heartbeat arrived — reset our local clock.
        lastSeenLocal.set(seenKey, now);
        presenceStamps.set(seenKey, stamp);
        userIds.add(presence.user_id);
        continue;
      }
      // Ignore heartbeats that stopped arriving — the device left without a
      // clean untrack (closed tab, sleeping laptop, dropped connection).
      if (previous < cutoff) continue;
      userIds.add(presence.user_id);
    }
  }

  for (const key of Array.from(lastSeenLocal.keys())) {
    if (!liveKeys.has(key)) {
      lastSeenLocal.delete(key);
      presenceStamps.delete(key);
    }
  }

  // Keep a user briefly while a heartbeat re-track settles, but schedule an
  // exact follow-up publish. Previously this cache was only reconsidered by a
  // later heartbeat, leaving the visible number wrong until refresh.
  let nextExpiry = Number.POSITIVE_INFINITY;
  for (const id of userIds) missingSince.delete(id);
  for (const id of currentUserIds) {
    if (userIds.has(id)) continue;
    // Route exit is deliberate, not a network blip. Remove this browser's user
    // immediately instead of applying the remote-user disconnect grace.
    if (!activeTracker && id === trackedUserId) {
      missingSince.delete(id);
      continue;
    }
    const missingAt = missingSince.get(id) ?? now;
    missingSince.set(id, missingAt);
    const remaining = LINGER_MS - (now - missingAt);
    if (remaining > 0) {
      userIds.add(id);
      nextExpiry = Math.min(nextExpiry, remaining);
    } else {
      missingSince.delete(id);
    }
  }
  if (Number.isFinite(nextExpiry)) scheduleLingerFlush(nextExpiry);

  return userIds;
}

const presenceStamps = new Map<string, string>();
let trackedUserId: string | null = null;

function sameIds(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

let publishTimer: ReturnType<typeof setTimeout> | null = null;

/** Coalesce bursts of sync/join/leave events into a single UI update. */
function publishCount() {
  if (publishTimer) return;
  publishTimer = setTimeout(() => {
    publishTimer = null;
    flushCount();
  }, PUBLISH_DEBOUNCE_MS);
}

function flushCount() {
  if (!sharedChannel) return;
  // While the socket is rebuilding, presence state is empty. Publishing that
  // would blank every counter for a second and then refill it — hold the last
  // known list instead.
  if (!subscribed || sharedChannel.state !== "joined") return;
  let nextIds: Set<string>;
  try {
    nextIds = collectUniqueUsers(sharedChannel);
  } catch {
    return;
  }
  const changed = !sameIds(nextIds, currentUserIds);
  currentUserIds = nextIds;
  currentCount = nextIds.size;
  if (!changed) return;
  for (const listener of Array.from(listeners)) {
    try {
      listener(currentCount);
    } catch {
      /* one bad subscriber must not break the others */
    }
  }
  for (const listener of Array.from(userListeners)) {
    try {
      listener(currentUserIds);
    } catch {
      /* ignore */
    }
  }
}

let trackingSync = Promise.resolve();

async function reconcileTracking() {
  const channel = sharedChannel;
  if (!channel || !subscribed) return;

  const active = Array.from(trackers.values()).at(-1);
  const nextSignature = active ? `${active.userId}:${active.channelId}` : "";
  if (nextSignature === trackedSignature) return;

  if (!active) {
    const departingUserId = trackedUserId;
    trackedSignature = "";
    await channel.untrack().catch(() => undefined);
    trackedUserId = departingUserId;
    flushCount();
    trackedUserId = null;
    return;
  }

  trackedSignature = nextSignature;
  trackedUserId = active.userId;
  await channel
    .track({
      user_id: active.userId,
      channel_id: active.channelId,
      online_at: new Date().toISOString(),
    })
    .catch(() => undefined);
  publishCount();
}

/**
 * React route effects can mount/clean up back-to-back, especially in Strict
 * Mode. Serialize track/untrack calls so an older async untrack can never land
 * after a newer track and leave the counters stuck until a page refresh.
 */
function syncTracking(): Promise<void> {
  trackingSync = trackingSync.then(reconcileTracking, reconcileTracking);
  return trackingSync;
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 1000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastHeartbeatAt = 0;
let windowListenersBound = false;

/** Drop the socket and build a fresh one — used whenever realtime dies. */
function resubscribe() {
  if (retryTimer) return;
  const delay = retryDelay;
  retryDelay = Math.min(retryDelay * 2, 15_000);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    const old = sharedChannel;
    sharedChannel = null;
    subscribed = false;
    trackedSignature = "";
    if (old) {
      try {
        supabase.removeChannel(old);
      } catch {
        /* ignore */
      }
    }
    ensureSharedChannel();
  }, delay);
}

/** Re-assert presence, rebuilding the channel if the socket is not joined. */
function revive() {
  if (!sharedChannel) {
    ensureSharedChannel();
    return;
  }
  if (sharedChannel.state !== "joined") {
    resubscribe();
    return;
  }
  trackedSignature = "";
  void syncTracking();
  publishCount();
}

function ensureSharedChannel() {
  if (sharedChannel) return;

  const channel = supabase.channel(TALK_PRESENCE_TOPIC, {
    config: { presence: { key: connectionId } },
  });

  const sync = () => publishCount();
  channel
    .on("presence", { event: "sync" }, sync)
    .on("presence", { event: "join" }, sync)
    .on("presence", { event: "leave" }, sync)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        subscribed = true;
        retryDelay = 1000;
        trackedSignature = "";
        void syncTracking();
        publishCount();
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        subscribed = false;
        resubscribe();
      }
    });

  sharedChannel = channel;

  // Refresh our own presence timestamp so other devices can tell a live
  // session from an abandoned one, and re-check everyone else for staleness.
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      // Background tabs get their timers throttled and sleeping machines stop
      // them entirely. When we detect a gap, everyone's "last seen" is stale
      // through no fault of theirs — reset the clocks instead of evicting them.
      const now = Date.now();
      if (lastHeartbeatAt && now - lastHeartbeatAt > HEARTBEAT_MS * 3) {
        for (const key of Array.from(lastSeenLocal.keys())) lastSeenLocal.set(key, now);
        missingSince.clear();
      }
      lastHeartbeatAt = now;
      const live = sharedChannel;
      if (!live) {
        ensureSharedChannel();
        return;
      }
      if (live.state !== "joined") {
        subscribed = false;
        resubscribe();
        return;
      }
      const active = Array.from(trackers.values()).at(-1);
      if (active) {
        void live
          .track({
            user_id: active.userId,
            channel_id: active.channelId,
            online_at: new Date().toISOString(),
          })
          .catch(() => undefined);
      }
      publishCount();
    }, HEARTBEAT_MS);
  }

  if (typeof window !== "undefined" && !windowListenersBound) {
    windowListenersBound = true;
    // Leaving the page: untrack immediately so every other screen drops the
    // card right away instead of waiting for the socket to time out.
    const leave = () => {
      trackedSignature = "";
      void sharedChannel?.untrack().catch(() => undefined);
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("beforeunload", leave);
    window.addEventListener("focus", revive);
    window.addEventListener("online", revive);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      // Coming back from a backgrounded tab: re-assert presence and resync.
      revive();
    });
  }
}


export function useTalkChannelPresence(options: {
  userId?: string;
  channelId?: string;
  track: boolean;
}): number {
  const { userId, channelId, track } = options;
  const trackerId = useRef(Symbol("talk-presence-tracker"));
  const [count, setCount] = useState(currentCount);

  useEffect(() => {
    ensureSharedChannel();
    listeners.add(setCount);
    setCount(currentCount);

    return () => {
      listeners.delete(setCount);
    };
  }, []);

  useEffect(() => {
    const id = trackerId.current;
    if (track && userId && channelId) {
      trackers.set(id, { userId, channelId });
    } else {
      trackers.delete(id);
    }
    void syncTracking();

    return () => {
      trackers.delete(id);
      void syncTracking();
    };
  }, [channelId, track, userId]);

  return count;
}

/** Set of user IDs currently present in the talk channels (read-only, never tracks). */
export function useTalkChannelPresentUsers(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(currentUserIds);

  useEffect(() => {
    ensureSharedChannel();
    userListeners.add(setIds);
    setIds(currentUserIds);

    return () => {
      userListeners.delete(setIds);
    };
  }, []);

  return ids;
}

/** Live count of everyone currently inside any Talk Channel, including staff. */
export function useTalkChannelTotalCount(): number {
  return useTalkChannelPresentUsers().size;
}

/** Live count of online non-staff members currently inside a Talk Channel. */
export function useTalkChannelMemberCount(): number {
  const onlineIds = useTalkChannelPresentUsers();
  const [, refresh] = useState(0);

  useEffect(() => {
    const listener = () => refresh((value) => value + 1);
    memberListeners.add(listener);
    if (!memberDirectoryLoaded) void loadMemberDirectory(true);
    const onFocus = () => void loadMemberDirectory();
    window.addEventListener("focus", onFocus);
    return () => {
      memberListeners.delete(listener);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Someone online who isn't in the cached directory yet (just signed up or
  // just had roles changed) would otherwise be silently uncounted — refresh.
  useEffect(() => {
    if (!memberDirectoryLoaded) return;
    for (const id of onlineIds) {
      if (!knownDirectoryIds.has(id)) {
        void loadMemberDirectory();
        break;
      }
    }
  }, [onlineIds]);

  let count = 0;
  for (const id of onlineIds) {
    if (memberIds.has(id)) count++;
  }
  return count;
}