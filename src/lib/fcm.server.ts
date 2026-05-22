import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getFcmAccessToken(): Promise<{ token: string; projectId: string }> {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_JSON is not configured");
  const sa = JSON.parse(raw) as {
    client_email: string;
    private_key: string;
    project_id: string;
    token_uri?: string;
  };

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const b64url = (buf: ArrayBuffer | Uint8Array | string) => {
    const bytes =
      typeof buf === "string"
        ? new TextEncoder().encode(buf)
        : buf instanceof Uint8Array
        ? buf
        : new Uint8Array(buf);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  };

  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const pem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const resp = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok) throw new Error(`FCM token: ${resp.status} ${await resp.text()}`);
  const j = (await resp.json()) as { access_token: string };
  return { token: j.access_token, projectId: sa.project_id };
}

/** Send a push to all admin/management users' registered devices. */
export async function pushToAdmins(args: {
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<{ sent: number; failed: number; skipped?: string }> {
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON) {
    return { sent: 0, failed: 0, skipped: "FCM_SERVICE_ACCOUNT_JSON not configured" };
  }

  const { data: roles, error: rolesErr } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "management"]);
  if (rolesErr) throw new Error(rolesErr.message);
  const userIds = Array.from(new Set((roles ?? []).map((r) => String(r.user_id))));
  if (userIds.length === 0) return { sent: 0, failed: 0, skipped: "no admin users" };

  const { data: tokens, error: tokErr } = await supabaseAdmin
    .from("device_push_tokens")
    .select("token")
    .in("user_id", userIds);
  if (tokErr) throw new Error(tokErr.message);
  if (!tokens?.length) return { sent: 0, failed: 0, skipped: "no device tokens" };

  return sendFcmToTokens(tokens.map((t) => t.token), args);
}

/** Send a push to ALL users that have a registered device token. */
export async function pushToAllDevices(args: {
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<{ sent: number; failed: number; skipped?: string }> {
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON) {
    return { sent: 0, failed: 0, skipped: "FCM_SERVICE_ACCOUNT_JSON not configured" };
  }
  const { data: tokens, error } = await supabaseAdmin
    .from("device_push_tokens")
    .select("token");
  if (error) throw new Error(error.message);
  if (!tokens?.length) return { sent: 0, failed: 0, skipped: "no device tokens" };
  return sendFcmToTokens(tokens.map((t) => t.token), args);
}

/** Send a push to users with any of the given roles. */
export async function pushToRoles(
  roles: ("admin" | "management" | "staff" | "moderator")[],
  args: { title: string; body: string; data?: Record<string, string> },
): Promise<{ sent: number; failed: number; skipped?: string }> {
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON) {
    return { sent: 0, failed: 0, skipped: "FCM_SERVICE_ACCOUNT_JSON not configured" };
  }
  const { data: roleRows, error: rolesErr } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", roles);
  if (rolesErr) throw new Error(rolesErr.message);
  const userIds = Array.from(new Set((roleRows ?? []).map((r) => String(r.user_id))));
  if (!userIds.length) return { sent: 0, failed: 0, skipped: "no users with roles" };

  const { data: tokens, error: tokErr } = await supabaseAdmin
    .from("device_push_tokens")
    .select("token")
    .in("user_id", userIds);
  if (tokErr) throw new Error(tokErr.message);
  if (!tokens?.length) return { sent: 0, failed: 0, skipped: "no device tokens" };
  return sendFcmToTokens(tokens.map((t) => t.token), args);
}

/** Send a push to a single user's registered devices. */
export async function pushToUser(
  userId: string,
  args: { title: string; body: string; data?: Record<string, string> },
): Promise<{ sent: number; failed: number; skipped?: string }> {
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON) {
    return { sent: 0, failed: 0, skipped: "FCM_SERVICE_ACCOUNT_JSON not configured" };
  }
  const { data: tokens, error } = await supabaseAdmin
    .from("device_push_tokens")
    .select("token")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!tokens?.length) return { sent: 0, failed: 0, skipped: "no device tokens" };
  return sendFcmToTokens(tokens.map((t) => t.token), args);
}

async function sendFcmToTokens(
  tokens: string[],
  args: { title: string; body: string; data?: Record<string, string> },
): Promise<{ sent: number; failed: number }> {
  let accessToken: string;
  let projectId: string;
  try {
    const t = await getFcmAccessToken();
    accessToken = t.token;
    projectId = t.projectId;
  } catch (e) {
    console.error("[fcm] getAccessToken failed:", e);
    throw e;
  }
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  console.log(`[fcm] sending to ${tokens.length} token(s) project=${projectId}`);

  let sent = 0;
  let failed = 0;
  const stale: string[] = [];
  for (const token of tokens) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: args.title, body: args.body },
          data: args.data ?? {},
          android: {
            priority: "HIGH",
            notification: {
              channel_id: "bm_support_alerts",
              sound: "default",
              default_sound: true,
              default_vibrate_timings: true,
              notification_priority: "PRIORITY_HIGH",
            },
          },
          apns: {
            payload: { aps: { sound: "default" } },
            headers: { "apns-priority": "10" },
          },
        },
      }),
    });
    if (res.ok) sent++;
    else {
      failed++;
      const txt = await res.text().catch(() => "");
      console.error(`[fcm] send failed status=${res.status} body=${txt.slice(0, 500)}`);
      // Only remove tokens Firebase explicitly says are unregistered. A 400
      // INVALID_ARGUMENT can also mean the payload is wrong, so deleting tokens
      // there can wipe every valid Android registration during debugging.
      if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(txt)) {
        stale.push(token);
      }
    }
  }
  console.log(`[fcm] done sent=${sent} failed=${failed} stale=${stale.length}`);
  if (stale.length) {
    await supabaseAdmin.from("device_push_tokens").delete().in("token", stale);
  }
  return { sent, failed };
}