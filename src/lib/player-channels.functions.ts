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
    try { return { channels: await playlistAllChannels(), error: null as string | null }; }
    catch (e) { return { channels: [], error: e instanceof Error ? e.message : "The playlist could not be read." }; }
  });
