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

    const presence = supabase.channel(TALK_PRESENCE_TOPIC, {
      config: {
        presence: {
          key: track && userId ? `${userId}:${connectionId}` : `observer-${connectionId}`,
        },
      },
    });

    const syncCount = () => {
      if (active) setCount(countUniqueUsers(presence));
    };

    presence
      .on("presence", { event: "sync" }, syncCount)
      .on("presence", { event: "join" }, syncCount)
      .on("presence", { event: "leave" }, syncCount)
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        if (track && userId && channelId) {
          await presence.track({
            user_id: userId,
            channel_id: channelId,
            online_at: new Date().toISOString(),
          });
        }
        syncCount();
      });

    return () => {
      active = false;
      void (async () => {
        if (track) await presence.untrack().catch(() => undefined);
        await supabase.removeChannel(presence);
      })();
    };
  }, [channelId, track, userId]);

  return count;
}