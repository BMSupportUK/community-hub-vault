import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Singleton presence channel — multiple hook instances must share ONE channel,
// otherwise Supabase throws "cannot add `presence` callbacks ... after `subscribe()`".
let channel: RealtimeChannel | null = null;
let channelUid: string | null = null;
let refCount = 0;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let currentState = new Set<string>();
const listeners = new Set<(s: Set<string>) => void>();

function notify() {
  for (const fn of listeners) fn(currentState);
}

function pingLastSeen(uid: string) {
  supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", uid).then(() => {});
}

function ensureChannel(uid: string) {
  if (channel && channelUid === uid) return;
  teardown();
  channelUid = uid;
  pingLastSeen(uid);
  pingInterval = setInterval(() => pingLastSeen(uid), 60_000);

  const ch = supabase.channel("presence:online", { config: { presence: { key: uid } } });
  const sync = () => {
    currentState = new Set(Object.keys(ch.presenceState()));
    notify();
  };
  ch.on("presence", { event: "sync" }, sync)
    .on("presence", { event: "join" }, sync)
    .on("presence", { event: "leave" }, sync)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ user_id: uid, online_at: new Date().toISOString() });
      }
    });
  channel = ch;
}

function teardown() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  if (channel) {
    if (channelUid) pingLastSeen(channelUid);
    channel.untrack().catch(() => {});
    supabase.removeChannel(channel);
    channel = null;
  }
  channelUid = null;
  currentState = new Set();
}

export function useOnlineUsers(): Set<string> {
  const { user } = useAuth();
  const [online, setOnline] = useState<Set<string>>(() => currentState);

  useEffect(() => {
    if (!user?.id) return;
    refCount++;
    ensureChannel(user.id);
    const listener = (s: Set<string>) => setOnline(s);
    listeners.add(listener);
    setOnline(currentState);
    return () => {
      listeners.delete(listener);
      refCount--;
      if (refCount <= 0) {
        refCount = 0;
        teardown();
      }
    };
  }, [user?.id]);

  return online;
}
