/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ LOCKED FILE — CHAT COUNTER ENGINE. DO NOT MODIFY WITHOUT AUTHORISATION.   │
 * │                                                                           │
 * │ This presence engine powers every chat counter in the app:                │
 * │   • side rail Customer Chatroom badge  (useTalkChannelTotalCount)         │
 * │   • "Jump back in" / hub "N in chat" pill                                 │
 * │   • Talk Channels Members panel count + green online dots                 │
 * │                                                                           │
 * │ It took many iterations to stop the counters flickering, ghosting, and    │
 * │ needing hard refreshes. Do NOT refactor, tidy, retime, or "simplify"      │
 * │ any of the constants or the track/untrack/linger/broadcast logic as a     │
 * │ side effect of unrelated work. Change it ONLY when the user explicitly    │
 * │ asks for a counter change in that request.                                │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const TALK_PRESENCE_TOPIC = "presence:talk-channels";

type TalkPresence = {
  user_id?: string;
  channel_id?: string;
  online_at?: string;
};

type TalkPresenceSignal = {
  action?: "join" | "leave";
  connection_id?: string;
  user_id?: string;
};

/**
 * Presences older than this are treated as gone (dropped tab / dead socket).
 * Generous vs. the heartbeat so a throttled background tab or a slow phone
 * never gets dropped and re-added — that churn is what made counts flicker.
 */
const STALE_MS = 180_000;
/** How often the local presence timestamp is refreshed while in a channel. */
const HEARTBEAT_MS = 45_000;
/** Counts settle for this long before publishing, so bursts land as one update. */
const PUBLISH_DEBOUNCE_MS = 250;
/**
 * A user keeps their online badge for this long after vanishing from presence
 * state. Every heartbeat re-`track()` emits leave+join on other clients, and a
 * socket re-join momentarily empties one key — without this grace window those
 * blips made people appear to go offline and come straight back.
 */
const LINGER_MS = 8_000;


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
/**
 * Some realtime clients emit a leave diff before their local presenceState()
 * snapshot has removed that connection. Remember the exact departed payload
 * so a stale snapshot cannot keep another browser's rail badge at 1.
 */
const departedPresenceStamps = new Map<string, string>();
/**
 * Explicit route-exit signals are faster and more reliable than waiting for
 * the presence state snapshot to settle. The next join from that connection
 * clears its tombstone.
 */
const explicitlyDepartedKeys = new Set<string>();
/** Users seen in an explicit leave diff must not be restored by reconnect linger. */
const cleanlyDepartedUserIds = new Set<string>();
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
      if (explicitlyDepartedKeys.has(seenKey)) continue;
      const previous = lastSeenLocal.get(seenKey);
      const stamp = presence.online_at ?? "";
      const departedStamp = departedPresenceStamps.get(seenKey);
      if (departedStamp !== undefined) {
        // Ignore the old snapshot after a leave. A genuinely new track has a
        // new heartbeat stamp and is safe to count immediately.
        if (!stamp || stamp === departedStamp) continue;
        departedPresenceStamps.delete(seenKey);
      }
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
  for (const id of userIds) {
    missingSince.delete(id);
    cleanlyDepartedUserIds.delete(id);
  }
  for (const id of currentUserIds) {
    if (userIds.has(id)) continue;
    // A presence leave is authoritative. The stale presenceState snapshot is
    // already ignored above, so remove the user now rather than applying the
    // reconnect-only grace period and showing a false green member status.
    if (cleanlyDepartedUserIds.delete(id)) {
      missingSince.delete(id);
      continue;
    }
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
  // would blank every counter for a second and then refill it. Hold the last
  // known list, but retry so a pending remote-user eviction is not lost if its
  // one-shot linger timer happens to fire during the reconnect.
  if (!subscribed || sharedChannel.state !== "joined") {
    scheduleLingerFlush(250);
    return;
  }
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

/**
 * A broadcast join can arrive before the realtime presence snapshot contains
 * that connection. Publish the user immediately so open member directories
 * update without an F5; the next presence sync remains authoritative.
 */
function publishJoinedUser(userId: string) {
  if (currentUserIds.has(userId)) return;
  const nextIds = new Set(currentUserIds);
  nextIds.add(userId);
  currentUserIds = nextIds;
  currentCount = nextIds.size;
  missingSince.delete(userId);
  cleanlyDepartedUserIds.delete(userId);
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
    if (departingUserId) {
      const departingKey = `${connectionId}:${departingUserId}`;
      explicitlyDepartedKeys.add(departingKey);
      cleanlyDepartedUserIds.add(departingUserId);
      void channel.send({
        type: "broadcast",
        event: "talk-presence-change",
        payload: {
          action: "leave",
          connection_id: connectionId,
          user_id: departingUserId,
        } satisfies TalkPresenceSignal,
      }).catch(() => undefined);
    }
    await channel.untrack().catch(() => undefined);
    trackedUserId = departingUserId;
    flushCount();
    trackedUserId = null;
    return;
  }

  trackedSignature = nextSignature;
  trackedUserId = active.userId;
  explicitlyDepartedKeys.delete(`${connectionId}:${active.userId}`);
  await channel
    .track({
      user_id: active.userId,
      channel_id: active.channelId,
      online_at: new Date().toISOString(),
    })
    .catch(() => undefined);
  void channel.send({
    type: "broadcast",
    event: "talk-presence-change",
    payload: {
      action: "join",
      connection_id: connectionId,
      user_id: active.userId,
    } satisfies TalkPresenceSignal,
  }).catch(() => undefined);
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
    config: {
      presence: { key: connectionId },
      broadcast: { self: true },
    },
  });

  const sync = () => publishCount();
  channel
    .on("broadcast", { event: "talk-presence-change" }, ({ payload }) => {
      const signal = payload as TalkPresenceSignal;
      if (!signal.connection_id || !signal.user_id) return;
      const presenceKey = `${signal.connection_id}:${signal.user_id}`;
      if (signal.action === "leave") {
        explicitlyDepartedKeys.add(presenceKey);
        cleanlyDepartedUserIds.add(signal.user_id);
      } else if (signal.action === "join") {
        explicitlyDepartedKeys.delete(presenceKey);
        departedPresenceStamps.delete(presenceKey);
        cleanlyDepartedUserIds.delete(signal.user_id);
        publishJoinedUser(signal.user_id);
      }
      flushCount();
    })
    .on("presence", { event: "sync" }, sync)
    .on("presence", { event: "join" }, ({ key, newPresences }) => {
      for (const presence of newPresences as TalkPresence[]) {
        if (!presence.user_id) continue;
        explicitlyDepartedKeys.delete(`${key}:${presence.user_id}`);
        departedPresenceStamps.delete(`${key}:${presence.user_id}`);
        cleanlyDepartedUserIds.delete(presence.user_id);
        publishJoinedUser(presence.user_id);
      }
      publishCount();
    })
    .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
      for (const presence of leftPresences as TalkPresence[]) {
        if (!presence.user_id) continue;
        // A leave diff is NOT proof the person left the chat: every heartbeat
        // re-track, and every socket rejoin, emits leave+join for the same
        // connection. Retire only this connection's snapshot and let the linger
        // grace decide, so members stop flicking offline/online. Genuine exits
        // still evict instantly via the explicit "leave" broadcast above.
        explicitlyDepartedKeys.add(`${key}:${presence.user_id}`);
        departedPresenceStamps.set(`${key}:${presence.user_id}`, presence.online_at ?? "");
      }
      publishCount();
    })

    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        subscribed = true;
        retryDelay = 1000;
        trackedSignature = "";
        void syncTracking();
        flushCount();
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