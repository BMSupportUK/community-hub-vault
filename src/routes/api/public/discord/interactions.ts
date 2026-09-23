import { createFileRoute } from "@tanstack/react-router";
import { createPublicKey, verify as cryptoVerify } from "crypto";

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
          const text: string = (message?.content ?? "").trim();
          const channelName: string | null = interaction.channel?.name ?? null;

          if (!text) {
            return Response.json({
              type: 4,
              data: { content: "That message has no text to import.", flags: 64 },
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

            const { error } = await supabaseAdmin.from("discord_import_queue").insert({
              raw_text: text.slice(0, 50_000),
              parsed_event: {
                title: postHeading(text),
                time: null,
                date: null,
                channels: [],
                raw: text,
                suggested_category: null,
                suggested_subcategory: null,
              } as any,
              status: "pending",
              source: "discord",
              source_ref: sourceRef,
              forwarded_from: channelName ? `#${channelName}` : "Discord",
            } as any);
            if (error) throw new Error(error.message);

            return Response.json({
              type: 4,
              data: { content: "✅ Added to the Sports Guide review queue.", flags: 64 },
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
