import type { SupabaseClient } from "@supabase/supabase-js";
import { boxLimitReached } from "@/lib/player-security";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any>;

/** Bell notification (and phone alert) for every admin and management user. */
export async function notifyPlayerAdmins(admin: Admin, title: string, body: string, link = "/admin-player") {
  const { data } = await admin.from("user_roles").select("user_id").in("role", ["admin", "management"]);
  const ids = [...new Set((data ?? []).map((r: { user_id: string }) => r.user_id))];
  if (!ids.length) return;
  await admin.from("user_notifications").insert(ids.map((user_id) => ({ user_id, kind: "mention", title, body, link_path: link, source_type: "player_security" })));
  try {
    const { pushToUser } = await import("@/lib/fcm.server");
    await Promise.all(ids.map((id) => pushToUser(id, { title, body, data: { link } })));
  } catch (e) { console.error("[player security push]", e); }
}

/**
 * Queue a login for a box. When this login already runs on the maximum number of the owner's
 * other boxes, the login is held and admins are asked to approve the extra box.
 */
export async function queuePlayerLogin(admin: Admin, opts: { deviceId: string; ownerId: string; username: string; password: string }) {
  const { count } = await admin.from("player_devices").select("id", { count: "exact", head: true })
    .eq("user_id", opts.ownerId).eq("iptv_username", opts.username).neq("id", opts.deviceId);
  // Staff accounts and owner-flagged test accounts are never held by the box limit.
  const [{ data: staffRole }, { data: exemptProfile }] = await Promise.all([
    admin.from("user_roles").select("role")
      .eq("user_id", opts.ownerId).in("role", ["admin", "management", "staff", "moderator"]).limit(1),
    admin.from("profiles").select("player_rules_exempt").eq("id", opts.ownerId).maybeSingle(),
  ]);
  const { loginConnections } = await import("@/lib/player-connections.server");
  const connections = await loginConnections(admin, opts.username);
  const held = boxLimitReached(count ?? 0, !!staffRole?.length || !!exemptProfile?.player_rules_exempt, connections as number | null);
  await admin.from("player_pending_credentials").upsert({ device_id: opts.deviceId, username: opts.username, password: opts.password, created_at: new Date().toISOString(), held });
  if (held) {
    await admin.from("player_security_events").insert({ kind: "box_limit", device_id: opts.deviceId, owner_id: opts.ownerId, login: opts.username, detail: { boxes: count } });
    await notifyPlayerAdmins(admin, "Approve extra BM Player box", `Login ${opts.username} is already on ${count} boxes. Approve or refuse the new box in BM Player › Security.`);
  }
  return { held };
}

/** Tell the owner a new box joined their account; Link Device lets them remove it ("Not me"). */
export async function notifyNewBox(admin: Admin, ownerId: string, deviceId: string, platform: string | null) {
  const title = "A new box was linked to your account";
  const body = `A ${platform ?? "BM Player"} box was just linked. Not you? Open Link Device and press "Not me" to remove it.`;
  await admin.from("user_notifications").insert({ user_id: ownerId, kind: "mention", title, body, link_path: "/send-to-app", source_type: "player_security" });
  await admin.from("player_security_events").insert({ kind: "new_box", device_id: deviceId, owner_id: ownerId, status: "closed" });
  try { const { pushToUser } = await import("@/lib/fcm.server"); await pushToUser(ownerId, { title, body, data: { link: "/send-to-app" } }); } catch (e) { console.error("[new box push]", e); }
}
