import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LINK_CODE_TTL_MS, PENDING_CREDENTIAL_TTL_MS } from "@/lib/player-link";
import { createSharedCache } from "@/lib/player-sports-cache";

// One sports-guide build per minute per server instance, however many apps ask.
const sportsCache = createSharedCache<{ version: string; events: unknown[]; aliases: unknown[] }>(60_000);

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
  z.object({
    action: z.literal("poll"), device_token: Token,
    login: z.string().trim().max(120).optional(),
    version: z.string().trim().max(20).optional(),
    watching: z.object({
      kind: z.enum(["live", "film", "series"]).catch("live"),
      title: z.string().trim().max(200),
      category: z.string().trim().max(120).optional(),
      player: z.string().trim().max(20).optional(),
      since: z.number().int().positive(),
    }).nullish(),
  }),
  z.object({ action: z.literal("unlink"), device_token: Token }),
  z.object({ action: z.literal("unlock"), device_token: Token, account_number: z.string().trim().regex(/^\d{6}$/) }),
  z.object({ action: z.literal("sports"), device_token: Token }),
  z.object({
    action: z.literal("connection_alert"), device_token: Token,
    active: z.number().int().min(0).max(100),
    max: z.number().int().min(1).max(100),
    exceeded_since: z.number().int().positive(),
    login: z.string().trim().max(120).optional(),
    version: z.string().trim().max(20).optional(),
  }),
  z.object({
    action: z.literal("report"), device_token: Token,
    kind: z.enum(["live", "film", "series"]),
    title: z.string().trim().min(1).max(200),
    category: z.string().trim().max(120).optional(),
    episode: z.string().trim().max(200).optional(),
    issue: z.string().trim().min(3).max(1000),
    device: z.string().trim().max(80).optional(),
    version: z.string().trim().max(20).optional(),
  }),
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

        const { data: device } = await supabaseAdmin.from("player_devices").select("id, user_id, last_seen_at, connected_since, vpn_status, vpn_checked_at")
          .eq("token_hash", await sha256Hex(body.device_token)).maybeSingle();
        if (!device) return json({ error: "Unknown device" }, 401);

        if (body.action === "unlink") {
          await supabaseAdmin.from("player_devices").delete().eq("id", device.id);
          return json({ ok: true });
        }

        if (body.action === "unlock") {
          if (!device.user_id) return json({ error: "Link this app to your BM Support account first." }, 403);
          const { data: lock } = await supabaseAdmin.from("player_devices").select("unlock_failures, unlock_locked_until").eq("id", device.id).single();
          if (lock?.unlock_locked_until && new Date(lock.unlock_locked_until).getTime() > Date.now())
            return json({ error: "Too many wrong tries. Please wait 15 minutes and try again." }, 429);
          const { data: cn } = await supabaseAdmin.from("customer_numbers").select("number").eq("user_id", device.user_id).maybeSingle();
          if (cn && String(cn.number) === body.account_number) {
            await supabaseAdmin.from("player_devices").update({ unlock_failures: 0, unlock_locked_until: null }).eq("id", device.id);
            return json({ ok: true });
          }
          const fails = (lock?.unlock_failures ?? 0) + 1;
          const locked = fails >= 5;
          await supabaseAdmin.from("player_devices").update({
            unlock_failures: locked ? 0 : fails,
            unlock_locked_until: locked ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
          }).eq("id", device.id);
          return json({ error: locked ? "Too many wrong tries. Please wait 15 minutes and try again." : "That account number isn't right. You can find it in your subscription box on bmsupport.uk." }, locked ? 429 : 401);
        }

        if (body.action === "report") {
          if (!device.user_id) return json({ error: "Link this app to your BM Support account first." }, 403);
          const { count } = await supabaseAdmin.from("tickets").select("id", { count: "exact", head: true })
            .eq("user_id", device.user_id).like("subject", "BM Player:%").gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
          if ((count ?? 0) >= 3) return json({ error: "You've just sent a few reports. Our staff will be with you shortly." }, 429);
          const slug = body.kind === "live" ? "live-tv" : "movies-series";
          const { data: cat } = await supabaseAdmin.from("ticket_categories").select("id").eq("slug", slug).maybeSingle();
          if (!cat) return json({ error: "Couldn't open a ticket. Try again." }, 503);
          const label = body.kind === "live" ? "Channel" : body.kind === "film" ? "Film" : "Series";
          const { data: t, error: tErr } = await supabaseAdmin.from("tickets")
            .insert({ user_id: device.user_id, subject: `BM Player: ${label} – ${body.title}`.slice(0, 200), category_id: cat.id, priority: "normal" })
            .select("id").single();
          if (tErr || !t) return json({ error: "Couldn't open a ticket. Try again." }, 503);
          const lines = [
            "Reported from BM Player", "",
            `${label}: ${body.title}`,
            body.episode ? `Episode: ${body.episode}` : null,
            body.category ? `Category: ${body.category}` : null,
            `Device: ${body.device || "Unknown"}${body.version ? ` · BM Player ${body.version}` : ""}`,
            "", `Problem: ${body.issue}`,
          ].filter((l) => l !== null).join("\n");
          await supabaseAdmin.from("ticket_messages").insert({ ticket_id: t.id, sender_id: device.user_id, is_internal: false, content: lines });
          return json({ ok: true, ticket_id: t.id });
        }

        if (body.action === "connection_alert") {
          const { CONNECTION_REPORT_COOLDOWN_MS, isSustainedConnectionExcess } = await import("@/lib/player-connection-limit");
          if (!isSustainedConnectionExcess({ active: body.active, max: body.max, exceededSince: body.exceeded_since, now: Date.now() }))
            return json({ error: "Connection limit has not been exceeded long enough" }, 400);
          const { data: recent } = await supabaseAdmin.from("player_connection_reports").select("id")
            .eq("device_id", device.id).gte("created_at", new Date(Date.now() - CONNECTION_REPORT_COOLDOWN_MS).toISOString()).limit(1).maybeSingle();
          if (recent) return json({ ok: true, reported: true, duplicate: true });
          const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
          const { error } = await supabaseAdmin.from("player_connection_reports").insert({
            device_id: device.id, user_id: device.user_id, iptv_username: body.login || null,
            active_connections: body.active, max_connections: body.max,
            exceeded_since: new Date(body.exceeded_since).toISOString(), ip, app_version: body.version || null,
          });
          if (error) return json({ error: "Could not report" }, 503);
          return json({ ok: true, reported: true });
        }

        if (body.action === "sports") {
          const payload = await sportsCache(async () => {
            const [{ data: blogs }, { data: cats }, { data: st }] = await Promise.all([
              supabaseAdmin.from("sports_blogs").select("title, body, category_id, updated_at").eq("published", true),
              supabaseAdmin.from("sports_categories").select("id, name, parent_id, sort_order").order("sort_order"),
              supabaseAdmin.from("player_settings").select("channel_aliases").eq("id", 1).maybeSingle(),
            ]);
            const { playerSportsEvents } = await import("@/lib/player-sports");
            const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
            const parentOf = new Map((cats ?? []).map((c) => [c.id, c.parent_id]));
            const events = playerSportsEvents((blogs ?? []).map((b) => {
              const pid = b.category_id ? parentOf.get(b.category_id) : null;
              return { title: b.title, body: b.body, category: b.category_id ? catName.get(b.category_id) ?? null : null, parent: pid ? catName.get(pid) ?? null : null };
            }));
            const version = (blogs ?? []).reduce((m, b) => (b.updated_at > m ? b.updated_at : m), "") + ":" + events.length;
            const order = Array.from(new Set((cats ?? []).map((c) => c.name)));
            return { version, events, order, aliases: Array.isArray(st?.channel_aliases) ? st.channel_aliases : [] };
          });
          return json(payload);
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
        const { presenceUpdate } = await import("@/lib/player-live");
        const { checkDeviceVpn, needsVpnCheck } = await import("@/lib/player-vpn");
        const now = Date.now();
        const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
        const fields = presenceUpdate({
          now, lastSeenAt: device.last_seen_at, connectedSince: device.connected_since,
          login: body.login, version: body.version, watching: body.watching ?? null,
          ip,
          cf: (request as unknown as { cf?: Record<string, unknown> }).cf ?? null,
          headerCountry: request.headers.get("cf-ipcountry"),
        });
        const [{ data: settings }, { data: pending }] = await Promise.all([
          supabaseAdmin.from("player_settings").select("dns, maintenance_enabled, maintenance_message").eq("id", 1).maybeSingle(),
          supabaseAdmin.from("player_pending_credentials").delete().eq("device_id", device.id).select("username, password, created_at").maybeSingle(),
        ]);
        // A poll that is about to hand the app its login must never wait on an
        // outside lookup; every later poll can pay for a fresh VPN verdict.
        if (!pending && needsVpnCheck({ ip, checkedAt: device.vpn_checked_at, status: device.vpn_status, now })) {
          Object.assign(fields, await checkDeviceVpn(ip as string));
        }
        await supabaseAdmin.from("player_devices").update(fields).eq("id", device.id);
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
