import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LINK_CODE_TTL_MS, PENDING_CREDENTIAL_TTL_MS } from "@/lib/player-link";

/**
 * Endpoint for the BM Player apps (TV, phone, Windows). Apps have no website
 * account; after "register" every call proves itself with the device token
 * (stored only as a hash). Logins are handed over once and then deleted.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
const Token = z.string().regex(/^[0-9a-f]{64}$/);
const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"),
    platform: z.enum(["android", "firetv", "phone", "windows"]),
    name: z.string().trim().min(1).max(60).optional(),
  }),
  z.object({ action: z.literal("code"), device_token: Token }),
  z.object({ action: z.literal("poll"), device_token: Token }),
  z.object({ action: z.literal("unlink"), device_token: Token }),
  z.object({ action: z.literal("sports"), device_token: Token }),
]);

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomHex(bytes: number) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS });

export const Route = createFileRoute("/api/public/player")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try { body = Body.parse(await request.json()); } catch { return json({ error: "Bad request" }, 400); }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (body.action === "register") {
          const token = randomHex(32);
          const { data, error } = await supabaseAdmin.from("player_devices")
            .insert({ token_hash: await sha256Hex(token), platform: body.platform, name: body.name ?? "BM Player" })
            .select("id").single();
          if (error) return json({ error: "Could not register" }, 500);
          return json({ device_id: data.id, device_token: token });
        }

        const { data: device } = await supabaseAdmin.from("player_devices").select("id, user_id")
          .eq("token_hash", await sha256Hex(body.device_token)).maybeSingle();
        if (!device) return json({ error: "Unknown device" }, 401);

        if (body.action === "unlink") {
          await supabaseAdmin.from("player_devices").delete().eq("id", device.id);
          return json({ ok: true });
        }

        if (body.action === "sports") {
          const [{ data: blogs }, { data: cats }, { data: st }] = await Promise.all([
            supabaseAdmin.from("sports_blogs").select("title, body, category_id, updated_at").eq("published", true),
            supabaseAdmin.from("sports_categories").select("id, name"),
            supabaseAdmin.from("player_settings").select("channel_aliases").eq("id", 1).maybeSingle(),
          ]);
          const { playerSportsEvents } = await import("@/lib/player-sports");
          const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
          const events = playerSportsEvents((blogs ?? []).map((b) => ({ title: b.title, body: b.body, category: b.category_id ? catName.get(b.category_id) ?? null : null })));
          const version = (blogs ?? []).reduce((m, b) => (b.updated_at > m ? b.updated_at : m), "") + ":" + events.length;
          return json({ version, events, aliases: Array.isArray(st?.channel_aliases) ? st.channel_aliases : [] });
        }

        if (body.action === "code") {
          await supabaseAdmin.from("player_link_codes").delete().eq("device_id", device.id);
          for (let i = 0; i < 5; i++) {
            const code = randomCode();
            const expires = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();
            const { error } = await supabaseAdmin.from("player_link_codes")
              .insert({ code_hash: await sha256Hex(code), device_id: device.id, expires_at: expires });
            if (!error) return json({ code, expires_at: expires });
          }
          return json({ error: "Try again" }, 500);
        }

        // poll: DNS + one-time credential handover
        await supabaseAdmin.from("player_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
        const { data: settings } = await supabaseAdmin.from("player_settings").select("dns, maintenance_enabled, maintenance_message").eq("id", 1).maybeSingle();
        const { data: pending } = await supabaseAdmin.from("player_pending_credentials")
          .delete().eq("device_id", device.id).select("username, password, created_at").maybeSingle();
        const fresh = pending && Date.now() - new Date(pending.created_at).getTime() < PENDING_CREDENTIAL_TTL_MS;
        return json({
          linked: !!device.user_id,
          dns: settings?.dns ?? "",
          credentials: fresh ? { username: pending.username, password: pending.password } : null,
          report_url: "https://bmsupport.uk/tickets",
          maintenance: {
            enabled: !!settings?.maintenance_enabled,
            message: settings?.maintenance_message || "BM Player is down for maintenance. Please try again soon.",
          },
        });
      },
    },
  },
});
