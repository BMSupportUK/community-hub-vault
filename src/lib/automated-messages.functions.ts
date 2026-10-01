import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Message wording for signed-in users. The table itself is staff-only, so
 * members get just the key/body pairs they need to post automated messages.
 */
export const getAutomatedMessageBodies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("automated_messages").select("key, body");
    if (error) throw new Error("Could not load messages");
    return (data ?? []) as { key: string; body: string }[];
  });
