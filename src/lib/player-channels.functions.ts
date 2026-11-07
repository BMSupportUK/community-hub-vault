import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin/management: every live playlist channel with its category (no logins returned). */
export const listPlayerChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [a, m] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "management" }),
    ]);
    if (!a.data && !m.data) throw new Error("Not allowed");
    const { playlistAllChannels } = await import("@/lib/playlist-source.server");
    // Event-only channels whose event is on now (from 10 min before start), so the list never shows them offline between events.
    const { buildSportsFeed } = await import("@/lib/player-sports-feed.server");
    const { eventWindowOpen } = await import("@/lib/player-channel-health");
    const openEventChannels = await buildSportsFeed()
      .then((f) => [...new Set(f.events.filter((e) => eventWindowOpen(e, Date.now())).flatMap((e) => e.channels.map((c) => c.trim().toLowerCase())))])
      .catch(() => [] as string[]);
    try { return { channels: await playlistAllChannels(), openEventChannels, error: null as string | null }; }
    catch (e) { return { channels: [], openEventChannels, error: e instanceof Error ? e.message : "The playlist could not be read." }; }
  });
