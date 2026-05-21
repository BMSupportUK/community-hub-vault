import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToAllDevices, pushToRoles } from "@/lib/fcm.server";

const VAPID_PUBLIC_KEY = "BD9Va9J0l6BMmpUuUyeUAG3zZ1x3GUc29WHmMPZtJRowqqDGr9KmbBQqH6p699WFj9Xmf5s_Vqo602MiCFKnjEI";

async function getWebPush() {
  const mod = await import("web-push");
  const webpush = (mod as any).default ?? mod;
  webpush.setVapidDetails(
    "mailto:admin@bmsupport.uk",
    VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return webpush;
}

export const saveSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      endpoint: z.string().url().max(2000),
      p256dh: z.string().min(1).max(500),
      auth: z.string().min(1).max(500),
      userAgent: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.userAgent ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ endpoint: z.string().url().max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function broadcast(title: string, body: string, url: string, tag: string) {
  const webpush = await getWebPush();
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (error) throw new Error(error.message);
  if (!subs?.length) return { sent: 0 };

  const payload = JSON.stringify({ title, body, url, tag });
  const stale: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (err: any) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) stale.push(s.id);
      }
    }),
  );
  if (stale.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
  }
  return { sent };
}

async function broadcastToRoles(
  roles: ("admin" | "management" | "staff" | "moderator")[],
  title: string,
  body: string,
  url: string,
  tag: string,
) {
  const webpush = await getWebPush();
  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", roles);
  const userIds = Array.from(new Set((roleRows ?? []).map((r) => String(r.user_id))));
  if (!userIds.length) return { sent: 0 };
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, user_id")
    .in("user_id", userIds);
  if (!subs?.length) return { sent: 0 };

  const payload = JSON.stringify({ title, body, url, tag });
  const stale: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (err: any) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) stale.push(s.id);
      }
    }),
  );
  if (stale.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
  }
  return { sent };
}

async function getActorName(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("display_name, username")
    .eq("id", userId)
    .maybeSingle();
  return (data?.display_name as string) || (data?.username as string) || "Someone";
}

export const sendShiftEventPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      kind: z.enum(["clock_in", "clock_out"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const name = await getActorName(context.userId);
    const title = data.kind === "clock_in" ? "Shift started" : "Shift ended";
    const body = `${name} ${data.kind === "clock_in" ? "clocked in" : "clocked out"}.`;
    const roles = ["admin", "management"] as const;
    const tag = `shift-${context.userId}-${data.kind}`;
    const [web, fcm] = await Promise.all([
      broadcastToRoles([...roles], title, body, "/clock", tag).catch((e) => ({ sent: 0, error: String(e) })),
      pushToRoles([...roles], {
        title,
        body,
        data: { kind: "shift", event: data.kind, userId: context.userId, url: "/clock" },
      }).catch((e) => ({ sent: 0, failed: 0, error: String(e) })),
    ]);
    return { web, fcm };
  });

export const sendBreakEventPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      kind: z.enum(["start", "end"]),
      breakKind: z.enum(["break", "lunch"]).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const name = await getActorName(context.userId);
    const label = data.breakKind === "lunch" ? "lunch" : "break";
    const title =
      data.kind === "start"
        ? data.breakKind === "lunch" ? "Lunch started" : "Break started"
        : "Break ended";
    const body = data.kind === "start"
      ? `${name} started a ${label} (${data.breakKind === "lunch" ? "30" : "15"} min).`
      : `${name} ended their ${label}.`;
    const roles = ["admin", "management"] as const;
    const tag = `break-${context.userId}-${data.kind}`;
    const [web, fcm] = await Promise.all([
      broadcastToRoles([...roles], title, body, "/clock", tag).catch((e) => ({ sent: 0, error: String(e) })),
      pushToRoles([...roles], {
        title,
        body,
        data: { kind: "break", event: data.kind, userId: context.userId, url: "/clock" },
      }).catch((e) => ({ sent: 0, failed: 0, error: String(e) })),
    ]);
    return { web, fcm };
  });

export const sendIncidentPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      incidentId: z.string().uuid(),
      title: z.string().min(1).max(200),
      kind: z.enum(["created", "updated"]),
      message: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const title =
      data.kind === "created"
        ? `New outage: ${data.title}`
        : `Update: ${data.title}`;
    const body = data.message?.trim() || (data.kind === "created" ? "An outage has been reported." : "A new update has been posted.");
    console.log(`[push] incident ${data.kind} ${data.incidentId}`);
    const [web, fcm] = await Promise.all([
      broadcast(title, body, "/status", `incident-${data.incidentId}`).catch((e) => ({ sent: 0, error: String(e) })),
      pushToAllDevices({
        title,
        body,
        data: { kind: "incident", incidentId: data.incidentId, url: "/status" },
      }).catch((e) => ({ sent: 0, failed: 0, error: String(e) })),
    ]);
    await supabaseAdmin.from("notification_log").insert({
      kind: "incident",
      channel: "push",
      target_id: data.incidentId,
      status: (web.sent > 0 || fcm.sent > 0) ? "sent" : "skipped",
      message: `web=${web.sent}${"failed" in web ? " failed" : ""}; fcm=${fcm.sent} failed=${"failed" in fcm ? fcm.failed : 0}`,
      error: ["error" in web ? web.error : null, "error" in fcm ? fcm.error : null].filter(Boolean).join(" | ") || null,
    } as never);
    console.log(`[push] incident result web=${web.sent} fcm=${fcm.sent}`);
    return { web, fcm };
  });

// Legacy Capacitor/FCM device token registration (kept for native shell)
export const registerDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      token: z.string().min(1).max(500),
      platform: z.enum(["android", "ios"]).default("android"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    console.log(`[push] registering ${data.platform} token for ${context.userId}`);
    const { error } = await supabaseAdmin
      .from("device_push_tokens")
      .upsert(
        {
          user_id: context.userId,
          token: data.token,
          platform: data.platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "token" },
      );
    if (error) throw new Error(error.message);
    console.log(`[push] registered ${data.platform} token`);
    return { ok: true };
  });