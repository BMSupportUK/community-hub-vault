import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Call only after password, factor or emailed-code verification by the server. */
export async function grantApplicationAccess(admin: SupabaseClient<Database>, userId: string, sessionId: unknown, scope: "screen" | "screen-bypass" | "dashboard" | "portal", expiresAt: string) {
  if (typeof sessionId !== "string" || !/^[a-f0-9-]{36}$/i.test(sessionId)) throw new Error("Please sign in again.");
  const now = new Date().toISOString();
  const { error } = await admin.from("application_access_sessions").upsert({ user_id: userId, session_id: sessionId, scope, granted_at: now, expires_at: expiresAt, last_activity_at: now, locked: false });
  if (error) throw new Error("Unable to unlock. Please try again.");
}
