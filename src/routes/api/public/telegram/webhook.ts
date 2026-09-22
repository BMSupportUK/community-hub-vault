import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

// Receives Telegram updates for the sports-listings bot.
// Registered with setWebhook using secret_token derived from the
// connector key, so only genuine Telegram deliveries pass verification.

function deriveTelegramWebhookSecret(telegramApiKey: string): string {
  return createHash("sha256").update(`telegram-webhook:${telegramApiKey}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function forwardedFromLabel(message: any): string | null {
  const origin = message?.forward_origin;
  if (origin?.type === "channel") return origin.chat?.title ?? "Telegram channel";
  if (origin?.type === "chat") return origin.sender_chat?.title ?? "Telegram group";
  if (origin?.type === "hidden_user") return "Telegram (hidden sender)";
  if (origin?.sender_user) {
    const u = origin.sender_user;
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || (u.username ? `@${u.username}` : null);
  }
  // Legacy fields
  if (message?.forward_from_chat?.title) return message.forward_from_chat.title;
  return null;
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Two bots can feed this endpoint: the dedicated sports bot (its own
        // token) and the shared connector bot. Accept either signature.
        const keys = [process.env.TELEGRAM_SPORTS_BOT_TOKEN, process.env.TELEGRAM_API_KEY]
          .map((k) => k?.trim())
          .filter((k): k is string => Boolean(k));
        if (keys.length === 0) return new Response("Not configured", { status: 500 });

        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        const authorised = keys.some((k) => safeEqual(actual, deriveTelegramWebhookSecret(k)));
        if (!authorised) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = await request.json().catch(() => null);
        const message = update?.message ?? update?.edited_message;
        const fromId: number | undefined = message?.from?.id;
        if (!message || typeof update?.update_id !== "number" || !fromId) {
          return Response.json({ ok: true, ignored: true });
        }

        const username: string | null = message?.from?.username ?? null;

        let allowed = false;
        try {
          const mod = await import("@/lib/telegram-ingest.server");
          allowed = await mod.isAllowedTelegramSender(fromId, username);
        } catch (e) {
          console.error("telegram webhook sender check failed:", e);
          return Response.json({ ok: true, ignored: true });
        }
        if (!allowed) return Response.json({ ok: true, ignored: true });

        const text: string | undefined = message.text ?? message.caption;
        if (!text || !text.trim()) return Response.json({ ok: true, ignored: true });

        try {
          const mod = await import("@/lib/telegram-ingest.server");
          const result = await mod.ingestTelegramPost({
            text: text.slice(0, 50_000),
            sourceRef: `tg:${update.update_id}`,
            forwardedFrom: forwardedFromLabel(message),
          });
          return Response.json({ ok: true, queued: result.queued });
        } catch (e: any) {
          console.error("telegram ingest failed:", e);
          // 200 so Telegram doesn't retry-bomb; the post can be re-forwarded.
          return Response.json({ ok: true, error: "ingest_failed" });
        }
      },
    },
  },
});
