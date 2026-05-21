import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
    return broadcast(title, body, "/status", `incident-${data.incidentId}`);
  });