import { createFileRoute } from "@tanstack/react-router";
import { createPublicKey, verify as cryptoVerify } from "crypto";
import { splitListingSections } from "@/lib/sports-listing-format";

// Receives Discord interaction webhooks. We register a MESSAGE context-menu
// command ("Send to Sports Guide") on the user's own bot; right-clicking a
// listings post in their server sends the full message content here, and it
// is queued as one whole block (same as the paste flow).
//
// Security: every request's Ed25519 signature is verified against the app's
// public key before anything is processed (Discord requirement).

function discordPublicKey(hexKey: string) {
  // Ed25519 SPKI DER prefix + raw 32-byte key
  const der = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(hexKey, "hex"),
  ]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

function verifyDiscordSignature(publicKeyHex: string, signature: string, timestamp: string, body: string): boolean {
  try {
    const key = discordPublicKey(publicKeyHex);
    return cryptoVerify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

/** Pull text out of a message: plain content, forwarded snapshots, or embeds. */
function extractMessageText(message: any): string {
  if (!message) return "";
  const parts: string[] = [];

  const collect = (m: any) => {
    if (!m) return;
    if (typeof m.content === "string" && m.content.trim()) parts.push(m.content.trim());
    for (const e of m.embeds ?? []) {
      if (e?.title) parts.push(String(e.title).trim());
      if (e?.description) parts.push(String(e.description).trim());
      for (const f of e?.fields ?? []) {
        const chunk = [f?.name, f?.value].filter(Boolean).join("\n").trim();
        if (chunk) parts.push(chunk);
      }
      if (e?.footer?.text) parts.push(String(e.footer.text).trim());
    }
    // Forwarded messages carry their original content here
    for (const snap of m.message_snapshots ?? []) collect(snap?.message);
    if (m.referenced_message) collect(m.referenced_message);
  };

  collect(message);
  return parts.join("\n\n").trim();
}

/** First meaningful line of a post, used as the queue item's heading. */
function postHeading(text: string): string {
  const line = text
    .split("\n")
    .map((l) => l.replace(/[*_`#>]+/g, "").trim())
    .find((l) => l.replace(/[^A-Za-z0-9]/g, "").length > 1);
  return (line || "Discord listing").slice(0, 300);
}

export const Route = createFileRoute("/api/public/discord/interactions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const publicKey = process.env.DISCORD_APP_PUBLIC_KEY?.trim();
        if (!publicKey) return new Response("Not configured", { status: 500 });

        const signature = request.headers.get("x-signature-ed25519") ?? "";
        const timestamp = request.headers.get("x-signature-timestamp") ?? "";
        const body = await request.text();

        if (!signature || !timestamp || !verifyDiscordSignature(publicKey, signature, timestamp, body)) {
          return new Response("Invalid request signature", { status: 401 });
        }

        const interaction = JSON.parse(body);

        // Discord endpoint verification ping
        if (interaction?.type === 1) {
          return Response.json({ type: 1 });
        }

        // Application command (our message context-menu command is type 2 with data.type 3)
        if (interaction?.type === 2 && interaction?.data?.type === 3) {
          const targetId: string | undefined = interaction.data.target_id;
          const message = targetId ? interaction.data.resolved?.messages?.[targetId] : null;
          const text: string = extractMessageText(message);
          const channelName: string | null = interaction.channel?.name ?? null;

          if (!text) {
            return Response.json({
              type: 4,
              data: {
                content:
                  "I couldn't read any text on that message. If it's an image or a bot card with no text, copy the listings and use Paste & Import instead.",
                flags: 64,
              },
            });
          }

          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const sourceRef = `discord:${targetId}`;

            const { data: existing } = await supabaseAdmin
              .from("discord_import_queue")
              .select("id")
              .eq("source_ref", sourceRef)
              .limit(1);
            if ((existing ?? []).length > 0) {
              return Response.json({
                type: 4,
                data: { content: "Already in the review queue — no duplicate created.", flags: 64 },
              });
            }

            // Never auto-split: every Discord post arrives as ONE pending import.
            // The admin decides whether to split it inside the importer.
            void splitListingSections;
            const blocks = [{ title: postHeading(text), raw: text.slice(0, 50_000) }];
            const rows = blocks.map((block, index) => ({
              raw_text: block.raw.slice(0, 50_000),
              parsed_event: {
                title: block.title,
                time: null,
                date: null,
                channels: [],
                raw: block.raw.slice(0, 50_000),
                suggested_category: null,
                suggested_subcategory: null,
              } as any,
              status: "pending",
              source: "discord",
              source_ref: blocks.length > 1 ? `${sourceRef}#${index + 1}` : sourceRef,
              forwarded_from: channelName ? `#${channelName}` : "Discord",
            }));
            const { error } = await supabaseAdmin.from("discord_import_queue").insert(rows as any);
            if (error) throw new Error(error.message);

            return Response.json({
              type: 4,
              data: {
                content: blocks.length > 1
                  ? `✅ Split into ${blocks.length} listings and added to the Sports Guide review queue.`
                  : "✅ Added to the Sports Guide review queue.",
                flags: 64,
              },
            });
          } catch (e) {
            console.error("discord ingest failed:", e);
            return Response.json({
              type: 4,
              data: { content: "Couldn't queue that post — try pasting it instead.", flags: 64 },
            });
          }
        }

        // Anything else: acknowledge so Discord doesn't retry
        return Response.json({ type: 1 });
      },
    },
  },
});
