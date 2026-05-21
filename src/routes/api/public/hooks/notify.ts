import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// POST /api/public/hooks/notify
// Called by Postgres triggers via pg_net when a row is inserted in
// signup_info, tickets, or private.orders. Loads the row, formats a short
// message, sends it to the configured Telegram chat through the Lovable
// connector gateway, and records the outcome in notification_log.
//
// Auth: requires the Supabase anon key in the `apikey` header.

const SITE = "https://bmsupport.uk";
const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

type Kind = "signup" | "ticket" | "order";

async function buildMessage(kind: Kind, id: string): Promise<string | null> {
  if (kind === "signup") {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("username, display_name")
      .eq("id", id)
      .maybeSingle();
    const { data: info } = await supabaseAdmin
      .from("signup_info")
      .select("country, city, isp, is_vpn, is_proxy")
      .eq("user_id", id)
      .maybeSingle();
    const name = (prof?.display_name as string) || (prof?.username as string) || "new user";
    const loc = [info?.city, info?.country].filter(Boolean).join(", ");
    const flags = [
      info?.is_vpn ? "VPN" : null,
      info?.is_proxy ? "proxy" : null,
    ].filter(Boolean).join(" / ");
    return [
      `🆕 *New signup:* ${escapeMd(name)}`,
      loc ? `📍 ${escapeMd(loc)}` : null,
      info?.isp ? `🌐 ${escapeMd(String(info.isp))}` : null,
      flags ? `⚠️ ${escapeMd(flags)}` : null,
      `→ ${SITE}/moderation`,
    ].filter(Boolean).join("\n");
  }

  if (kind === "ticket") {
    const { data: t } = await supabaseAdmin
      .from("tickets")
      .select("subject, priority, user_id, category_id")
      .eq("id", id)
      .maybeSingle();
    if (!t) return null;
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("username, display_name")
      .eq("id", (t as { user_id: string }).user_id)
      .maybeSingle();
    const who = (prof?.display_name as string) || (prof?.username as string) || "member";
    const subj = (t as { subject: string }).subject || "(no subject)";
    const prio = (t as { priority: string }).priority || "normal";
    return [
      `🎫 *New ticket* from ${escapeMd(who)}`,
      `_${escapeMd(subj)}_`,
      `Priority: ${escapeMd(prio)}`,
      `→ ${SITE}/tickets?id=${id}`,
    ].join("\n");
  }

  if (kind === "order") {
    const { data: o } = await supabaseAdmin
      .schema("private" as never)
      .from("orders")
      .select("user_id, status, total_cents, shipping_name")
      .eq("id", id)
      .maybeSingle();
    if (!o) return null;
    const total = ((Number((o as { total_cents: number }).total_cents) || 0) / 100).toFixed(2);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("username, display_name")
      .eq("id", (o as { user_id: string }).user_id)
      .maybeSingle();
    const who =
      ((o as { shipping_name?: string }).shipping_name as string) ||
      (prof?.display_name as string) ||
      (prof?.username as string) ||
      "customer";
    return [
      `🛒 *${(o as { status: string }).status === "pending" ? "New order" : "Order " + (o as { status: string }).status}* — £${total}`,
      `from ${escapeMd(who)}`,
      `→ ${SITE}/shop?view=admin`,
    ].join("\n");
  }

  return null;
}

// Telegram MarkdownV2 needs heavy escaping; we use plain "Markdown" (legacy) instead
// which only treats *_`[ as special and tolerates most punctuation. Keep escaping minimal.
function escapeMd(s: string): string {
  return String(s).replace(/([_*`\[\]])/g, "\\$1");
}

async function sendTelegram(chatId: string, text: string) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  if (!TELEGRAM_API_KEY) throw new Error("TELEGRAM_API_KEY not configured");
  const res = await fetch(`${GATEWAY}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Telegram ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function log(
  kind: Kind | "test",
  target_id: string | null,
  status: "sent" | "failed" | "skipped",
  message: string | null,
  error: string | null,
) {
  await supabaseAdmin.from("notification_log").insert({
    kind,
    channel: "telegram",
    target_id,
    status,
    message,
    error,
  } as never);
}

export const Route = createFileRoute("/api/public/hooks/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { kind?: Kind; id?: string; test?: boolean; text?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        // Load settings
        const { data: settings } = await supabaseAdmin
          .from("notification_settings")
          .select("*")
          .eq("id", true)
          .maybeSingle();

        const chatId = (settings as { telegram_chat_id?: string } | null)?.telegram_chat_id;
        if (!chatId) {
          await log((body.kind as Kind) ?? "test", body.id ?? null, "skipped", null, "no telegram_chat_id configured");
          return Response.json({ ok: false, skipped: "no chat id" });
        }

        // Test path: send arbitrary text
        if (body.test) {
          const text = body.text || "✅ Test message from BM Support";
          try {
            await sendTelegram(chatId, text);
            await log("test", null, "sent", text, null);
            return Response.json({ ok: true });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await log("test", null, "failed", text, msg);
            return Response.json({ ok: false, error: msg }, { status: 502 });
          }
        }

        const kind = body.kind;
        const id = body.id;
        if (!kind || !id) return new Response("Missing kind/id", { status: 400 });

        // Per-kind toggle
        const enabled =
          kind === "signup" ? (settings as { notify_signups?: boolean }).notify_signups :
          kind === "ticket" ? (settings as { notify_tickets?: boolean }).notify_tickets :
          kind === "order"  ? (settings as { notify_orders?: boolean  }).notify_orders  : false;
        if (!enabled) {
          await log(kind, id, "skipped", null, "disabled in settings");
          return Response.json({ ok: true, skipped: "disabled" });
        }

        // Idempotency: skip if we already logged a successful send for this row
        const { data: already } = await supabaseAdmin
          .from("notification_log")
          .select("id")
          .eq("kind", kind)
          .eq("target_id", id)
          .eq("status", "sent")
          .limit(1)
          .maybeSingle();
        if (already) return Response.json({ ok: true, skipped: "duplicate" });

        let text: string | null = null;
        try {
          text = await buildMessage(kind, id);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await log(kind, id, "failed", null, `build: ${msg}`);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
        if (!text) {
          await log(kind, id, "skipped", null, "row not found");
          return Response.json({ ok: true, skipped: "no row" });
        }

        try {
          await sendTelegram(chatId, text);
          await log(kind, id, "sent", text, null);
          return Response.json({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await log(kind, id, "failed", text, msg);
          return Response.json({ ok: false, error: msg }, { status: 502 });
        }
      },
    },
  },
});