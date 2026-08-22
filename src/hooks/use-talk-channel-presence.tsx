import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const TALK_PRESENCE_TOPIC = "presence:talk-channels";

type TalkPresence = {
  user_id?: string;
  channel_id?: string;
};

function countUniqueUsers(channel: RealtimeChannel): number {
  const state = channel.presenceState<TalkPresence>();
  const userIds = new Set<string>();

  for (const presences of Object.values(state)) {
    for (const presence of presences) {
      if (presence.user_id) userIds.add(presence.user_id);
    }
  }

  return userIds.size;
}

export function useTalkChannelPresence(options: {
  userId?: string;
  channelId?: string;
  track: boolean;
}): number {
  const { userId, channelId, track } = options;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (track && (!userId || !channelId)) return;

    let active = true;
    const connectionId = crypto.randomUUID();
    const syncTimers = new Set<ReturnType<typeof setTimeout>>();

    const presence = supabase.channel(TALK_PRESENCE_TOPIC, {
      config: {
        broadcast: { self: false },
        presence: {
          key: track && userId ? `${userId}:${connectionId}` : `observer-${connectionId}`,
        },
      },
    });

    const syncCount = () => {
      if (active) setCount(countUniqueUsers(presence));
    };

    const syncLiveCount = () => {
      syncCount();
      for (const delay of [100, 500]) {
        const timer = setTimeout(() => {
          syncTimers.delete(timer);
          syncCount();
        }, delay);
        syncTimers.add(timer);
      }
    };

    presence
      .on("presence", { event: "sync" }, syncLiveCount)
      .on("presence", { event: "join" }, syncLiveCount)
      .on("presence", { event: "leave" }, syncLiveCount)
      .on("broadcast", { event: "occupancy_changed" }, syncLiveCount)
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        if (track && userId && channelId) {
          await presence.track({
            user_id: userId,
            channel_id: channelId,
            online_at: new Date().toISOString(),
          });
          await presence.send({ type: "broadcast", event: "occupancy_changed", payload: {} });
        }
        syncLiveCount();
      });

    return () => {
      active = false;
      for (const timer of syncTimers) clearTimeout(timer);
      syncTimers.clear();
      void (async () => {
        if (track) {
          await presence.untrack().catch(() => undefined);
          await presence.send({ type: "broadcast", event: "occupancy_changed", payload: {} }).catch(() => undefined);
        }
        await supabase.removeChannel(presence);
      })();
    };
  }, [channelId, track, userId]);

  return count;
}