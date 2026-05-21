import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// --- FCM v1 OAuth2 access token from service account JSON ---
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

  // Import PEM private key
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
  if (!resp.ok) throw new Error(`Failed to fetch FCM token: ${resp.status} ${await resp.text()}`);
  const j = (await resp.json()) as { access_token: string };
  return { token: j.access_token, projectId: sa.project_id };
}

// --- Register a device token for the current user ---
export const registerDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        token: z.string().min(10).max(4096),
        platform: z.enum(["android", "ios", "web"]).default("android"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("device_push_tokens")
      .upsert(
        {
          user_id: userId,
          token: data.token,
          platform: data.platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "token" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Send a push notification to specific user(s) ---
export const sendPushToUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userIds: z.array(z.string().uuid()).min(1).max(500),
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(1000),
        data: z.record(z.string(), z.string()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Authorization: admin/management only
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    if (!callerRoles.some((r) => r === "admin" || r === "management")) {
      throw new Error("Forbidden: admin or management only");
    }

    const { data: tokens, error } = await supabaseAdmin
      .from("device_push_tokens")
      .select("token")
      .in("user_id", data.userIds);
    if (error) throw new Error(error.message);
    if (!tokens?.length) return { sent: 0, failed: 0 };

    const { token: accessToken, projectId } = await getFcmAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    let sent = 0;
    let failed = 0;
    const stale: string[] = [];

    for (const { token } of tokens) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: data.title, body: data.body },
            data: data.data ?? {},
            android: { priority: "HIGH", notification: { channel_id: "bm_support_alerts" } },
          },
        }),
      });
      if (res.ok) {
        sent++;
      } else {
        failed++;
        if (res.status === 404 || res.status === 400) stale.push(token);
      }
    }

    if (stale.length) {
      await supabaseAdmin.from("device_push_tokens").delete().in("token", stale);
    }

    return { sent, failed };
  });