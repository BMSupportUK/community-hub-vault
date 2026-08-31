import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const TALK_PRESENCE_TOPIC = "presence:talk-channels";

type TalkPresence = {
  user_id?: string;
  channel_id?: string;
  online_at?: string;
};

/** Presences older than this are treated as gone (dropped tab / dead socket). */
const STALE_MS = 45_000;
/** How often the local presence timestamp is refreshed while in a channel. */
const HEARTBEAT_MS = 15_000;

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
let memberDirectoryLoaded = false;
let memberDirectoryRequest: Promise<void> | null = null;
const memberListeners = new Set<() => void>();

async function loadMemberDirectory() {
  if (memberDirectoryRequest) return memberDirectoryRequest;
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
    memberDirectoryLoaded = true;
    for (const listener of Array.from(memberListeners)) listener();
  })().finally(() => {
    memberDirectoryRequest = null;
  });
  return memberDirectoryRequest;
}

function collectUniqueUsers(channel: RealtimeChannel): Set<string> {
  const state = channel.presenceState<TalkPresence>();
  const userIds = new Set<string>();
  const cutoff = Date.now() - STALE_MS;

  for (const presences of Object.values(state)) {
    for (const presence of presences) {
      if (!presence.user_id) continue;
      // Ignore heartbeats that stopped arriving — the device left without a
      // clean untrack (closed tab, sleeping laptop, dropped connection).
      if (presence.online_at) {
        const seen = new Date(presence.online_at).getTime();
        if (Number.isFinite(seen) && seen < cutoff) continue;
      }
      userIds.add(presence.user_id);
    }
  }

  return userIds;
}

function sameIds(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

function publishCount() {
  if (!sharedChannel) return;
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

async function syncTracking() {
  const channel = sharedChannel;
  if (!channel || !subscribed) return;

  const active = Array.from(trackers.values()).at(-1);
  const nextSignature = active ? `${active.userId}:${active.channelId}` : "";
  if (nextSignature === trackedSignature) return;

  if (!active) {
    trackedSignature = "";
    await channel.untrack().catch(() => undefined);
    publishCount();
    return;
  }

  trackedSignature = nextSignature;
  await channel
    .track({
      user_id: active.userId,
      channel_id: active.channelId,
      online_at: new Date().toISOString(),
    })
    .catch(() => undefined);
  publishCount();
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 1000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
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
    if (!memberDirectoryLoaded) void loadMemberDirectory();
    const onFocus = () => void loadMemberDirectory();
    window.addEventListener("focus", onFocus);
    return () => {
      memberListeners.delete(listener);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  let count = 0;
  for (const id of onlineIds) {
    if (memberIds.has(id)) count++;
  }
  return count;
}