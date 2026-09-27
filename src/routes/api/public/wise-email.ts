import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { parseWiseEmail, stripHtml } from "@/lib/wise-email-parse";

function tokenOk(given: string | null) {
  const expected = process.env.WISE_EMAIL_WEBHOOK_TOKEN ?? "";
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function pick(obj: Record<string, any>, keys: string[]) {
  for (const k of keys) {
    const value = obj[k];
    if (typeof value === "string" && value) return value;
    if (Array.isArray(value)) {
      const text = value.find((item) => typeof item === "string" && item);
      if (typeof text === "string") return text;
    }
  }
  return "";
}

function decodeQuotedPrintable(value: string) {
  return value
    .replace(/=\r?\n/g, "")
    .replace(/=([A-Fa-f0-9]{2})/g, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") collectStrings(parsed, output);
    } catch {
      // Normal email text is not JSON.
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
  return output;
}

function extractGmailForwardingConfirmation(subject: string, body: string) {
  const readableBody = stripHtml(decodeQuotedPrintable(body))
    .replace(/&amp;/gi, "&")
    .replace(/&#x3D;|&#61;/gi, "=");
  if (!/gmail forwarding confirmation|receive mail from/i.test(`${subject}\n${readableBody}`)) return null;
  const code = readableBody.match(/(?:confirmation code|code)\D{0,120}(\d{6,12})/i)?.[1]
    ?? readableBody.match(/\b(\d{9})\b/)?.[1]
    ?? null;
  const url = readableBody.match(/https?:\/\/mail-settings\.google\.com\/mail\/vf-[^\s<>"')\]]+/i)?.[0]
    ?? readableBody.match(/https?:\/\/(?:mail\.)?google\.com\/[^\s<>"']+/i)?.[0]
    ?? null;
  return { code, url };
}

/** Receives forwarded Wise "money received" emails (Postmark, Mailgun, CloudMailin, or plain JSON). */
export const Route = createFileRoute("/api/public/wise-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        if (!tokenOk(url.searchParams.get("token"))) return new Response("Unauthorized", { status: 401 });

        let data: Record<string, any> = {};
        const type = request.headers.get("content-type") ?? "";
        try {
          if (type.includes("json")) data = await request.json();
          else {
            const form = await request.formData();
            for (const [key, value] of form.entries()) {
              data[key] = typeof value === "string" ? value : await value.text();
            }
          }
        } catch {
          return new Response("Bad body", { status: 400 });
        }
        // CloudMailin "Multipart" posts `headers` as a JSON string; JSON format posts it as an object.
        let headers: Record<string, any> = {};
        if (data.headers && typeof data.headers === "object") headers = data.headers;
        else if (typeof data.headers === "string") {
          try { headers = JSON.parse(data.headers); } catch { /* ignore */ }
        }
        const subject = pick(data, ["Subject", "subject"]) || pick(headers, ["subject", "Subject"]);
        let body = pick(data, ["TextBody", "text", "body-plain", "plain", "stripped-text", "body"]);
        if (!body) body = stripHtml(pick(data, ["HtmlBody", "html", "body-html"]));
        const from = pick(data, ["From", "from", "sender"]) || pick(headers, ["from", "From"]);

        // CloudMailin's normalized multipart shape varies by message. Search every
        // textual field so Gmail's confirmation cannot be lost when it is nested
        // inside headers, plain/html parts, or quoted-printable content.
        const allText = collectStrings(data).join("\n").slice(0, 100_000);
        const gmailConfirmation = extractGmailForwardingConfirmation(subject, `${body}\n${allText}`);
        const isGmailForwardingMessage = /forwarding-noreply@google\.com/i.test(`${from}\n${allText}`)
          || /gmail forwarding confirmation|receive mail from/i.test(`${subject}\n${allText}`);
        if (gmailConfirmation || isGmailForwardingMessage) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("email_forwarding_confirmations").insert({
            sender: from.slice(0, 300),
            subject: subject.slice(0, 300),
            confirmation_code: gmailConfirmation?.code ?? null,
            confirmation_url: gmailConfirmation?.url ?? null,
            excerpt: stripHtml(decodeQuotedPrintable(`${body}\n${allText}`)).replace(/\s+/g, " ").trim().slice(0, 1000),
          });
          if (error) return new Response("Save failed", { status: 500 });
          return new Response("confirmation saved");
        }

        if (from && !/wise\.com|transferwise/i.test(from) && !/wise/i.test(`${subject} ${body}`)) {
          return new Response("ignored", { status: 200 });
        }
        const parsed = parseWiseEmail(subject.slice(0, 300), body.slice(0, 20000));
        if (!parsed) return new Response("ignored", { status: 200 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Payments are never auto-matched: admin/management allocate each one
        // to its order by hand on the Bank Transfer page.
        const amount = (parsed.amountCents / 100).toFixed(2);
        const who = parsed.senderName ?? "Unknown sender";

        const { error } = await supabaseAdmin.from("wise_email_payments").insert({
          amount_cents: parsed.amountCents,
          currency: parsed.currency,
          sender_name: parsed.senderName?.slice(0, 120) ?? null,
          reference: parsed.reference.slice(0, 120),
          subject: subject.slice(0, 300),
          excerpt: body.replace(/\s+/g, " ").trim().slice(0, 500),
          matched_order_id: null,
        });
        if (error) return new Response("Save failed", { status: 500 });

        // Alert admin/management in the staff notification bell.
        await supabaseAdmin.from("staff_notifications").insert({
          kind: "wise_payment",
          title: `Wise payment received: ${parsed.currency} ${amount}`,
          body: `${who} paid ${parsed.currency} ${amount} — reference "${parsed.reference}". Allocate it to its order on the Bank Transfer page.`,
          link_path: "/admin-bank-transfer",
        });
        return new Response("ok");
      },
    },
  },
});
