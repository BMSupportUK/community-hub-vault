import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * App update announcements.
 *
 * When staff publish a new APK (or bump the version / replace the file on an
 * existing app card) every member who is allowed to install the app gets one
 * bell notification + push. `scheduled_alert_log` keeps the "once per member
 * per release" guarantee, so re-saving the same build never re-alerts anyone.
 */

const AUDIENCE_ROLES = ["subscriber", "admin", "management", "staff"] as const;

export async function announceAppUpdate(opts: {
  buildId: string;
  appName: string | null;
  fileName: string;
  versionName: string | null;
  releaseNotes: string | null;
}): Promise<{ notified: number; alertKey: string }> {
  const label = opts.appName || opts.fileName || "our app";
  const version = opts.versionName?.trim() || opts.fileName;
  const alertKey = `app_update:${opts.buildId}:${version}`;

  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", AUDIENCE_ROLES as unknown as string[]);
  const audience = [...new Set((roleRows ?? []).map((r) => r.user_id as string))];
  if (audience.length === 0) return { notified: 0, alertKey };

  const { data: sentRows } = await supabaseAdmin
    .from("scheduled_alert_log")
    .select("user_id")
    .eq("alert_key", alertKey);
  const alreadySent = new Set((sentRows ?? []).map((r) => r.user_id as string));
  const recipients = audience.filter((id) => !alreadySent.has(id));
  if (recipients.length === 0) return { notified: 0, alertKey };

  const notes = (opts.releaseNotes || "").trim().slice(0, 180);
  const body = [
    opts.versionName ? `${label} ${opts.versionName} is ready to install.` : `A new version of ${label} is ready to install.`,
    notes,
  ]
    .filter(Boolean)
    .join(" ");

  // Insert the log rows first so a retry can't double-alert anybody.
  await supabaseAdmin
    .from("scheduled_alert_log")
    .insert(recipients.map((user_id) => ({ user_id, alert_key: alertKey })) as never);

  const { error } = await supabaseAdmin.from("user_notifications").insert(
    recipients.map((user_id) => ({
      user_id,
      kind: "app_update",
      title: `App update available — ${label}`,
      body,
      link_path: "/install-guides?tab=app",
      source_type: "app_build",
      source_id: opts.buildId,
    })) as never,
  );
  if (error) throw new Error(error.message);

  return { notified: recipients.length, alertKey };
}
