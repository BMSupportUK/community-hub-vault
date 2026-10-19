import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { NotifyCategory, NotifyChannel } from "./notification-categories";

/** User IDs that switched this category off for this channel. */
export async function optedOutUsers(category: NotifyCategory, channel: NotifyChannel): Promise<Set<string>> {
  const { data } = await (supabaseAdmin as any)
    .from("notification_channel_prefs")
    .select("user_id")
    .eq("category", category)
    .eq(channel, false);
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => String(r.user_id)));
}
