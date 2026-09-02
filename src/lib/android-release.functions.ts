import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ANDROID_RELEASE } from "@/lib/android-release";

/**
 * Sends the "a new Android version is ready" alert exactly once per member per
 * release. Any signed-in member's app shell can call this; `scheduled_alert_log`
 * holds the once-only guarantee, so concurrent calls can't double-notify.
 */
export const announceAndroidRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const alertKey = `android_release:${ANDROID_RELEASE.versionName}`;

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["subscriber", "admin", "management", "staff", "moderator"] as unknown as never[]);
    const audience = [...new Set((roleRows ?? []).map((r) => r.user_id as string))];
    if (audience.length === 0) return { notified: 0 };

    const { data: sentRows } = await supabaseAdmin
      .from("scheduled_alert_log")
      .select("user_id")
      .eq("alert_key", alertKey);
    const alreadySent = new Set((sentRows ?? []).map((r) => r.user_id as string));
    const recipients = audience.filter((id) => !alreadySent.has(id));
    if (recipients.length === 0) return { notified: 0 };

    // Log first so a retry or a parallel caller can never alert twice.
    const { error: logError } = await supabaseAdmin
      .from("scheduled_alert_log")
      .insert(recipients.map((user_id) => ({ user_id, alert_key: alertKey })) as never);
    if (logError) return { notified: 0 };

    const { error } = await supabaseAdmin.from("user_notifications").insert(
      recipients.map((user_id) => ({
        user_id,
        kind: "app_update",
        title: `BM Support ${ANDROID_RELEASE.versionName} is available`,
        body: `${ANDROID_RELEASE.notes} Install it straight over your current app — no need to uninstall.`,
        link_path: "/install-guides?tab=get-app",
        source_type: "android_release",
        source_id: null,
      })) as never,
    );
    if (error) throw new Error(error.message);

    return { notified: recipients.length };
  });
