import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const TALK_PRESENCE_TOPIC = "presence:talk-channels";

type TalkPresence = {
  user_id?: string;
  channel_id?: string;
};

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

function collectUniqueUsers(channel: RealtimeChannel): Set<string> {
  const state = channel.presenceState<TalkPresence>();
  const userIds = new Set<string>();

  for (const presences of Object.values(state)) {
    for (const presence of presences) {
      if (presence.user_id) userIds.add(presence.user_id);
    }
  }

  return userIds;
}

function publishCount() {
  if (!sharedChannel) return;
  currentUserIds = collectUniqueUsers(sharedChannel);
  currentCount = currentUserIds.size;
  for (const listener of listeners) listener(currentCount);
  for (const listener of userListeners) listener(currentUserIds);
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
  await channel.track({
    user_id: active.userId,
    channel_id: active.channelId,
    online_at: new Date().toISOString(),
  });
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
      if (status !== "SUBSCRIBED") return;
      subscribed = true;
      void syncTracking();
      publishCount();
    });

  sharedChannel = channel;
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