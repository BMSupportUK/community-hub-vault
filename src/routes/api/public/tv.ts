import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Endpoint for the BM Remote Helper TV app. The TV has no BM Support account,
 * so every call after pairing proves itself with the device token issued here
 * (stored only as a hash). Returns no customer or staff personal data.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pair"), device_name: z.string().trim().min(1).max(60).optional() }),
  z.object({ action: z.enum(["status", "end", "ice"]), session_id: z.string().uuid(), device_token: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.object({ action: z.literal("consent"), session_id: z.string().uuid(), device_token: z.string().regex(/^[0-9a-f]{64}$/), allow: z.boolean() }),
]);

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomHex(bytes: number) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  const a = crypto.getRandomValues(new Uint32Array(1))[0];
  return String(a % 1_000_000).padStart(6, "0");
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS });

async function iceServers() {
  const servers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const cfKeyId = process.env["CF_TURN_KEY_ID"];
  const cfToken = process.env["CF_TURN_KEY_TOKEN"];
  if (cfKeyId && cfToken) {
    try {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${cfKeyId}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 3600 }),
      });
      if (res.ok) {
        const j = (await res.json()) as { iceServers?: typeof servers | (typeof servers)[number] };
        servers.push(...(Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : []));
      } else console.error(`TV TURN failed [${res.status}]`);
    } catch (e) { console.error("TV TURN error", e); }
  }
  return servers;
}

export const Route = createFileRoute("/api/public/tv")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid request" }, 400);
        const body = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin;

        if (body.action === "pair") {
          const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
          const ipHash = await sha256Hex(`tv:${ip}`);
          const since = new Date(Date.now() - 10 * 60_000).toISOString();
          const { count } = await db.from("tv_remote_sessions").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
          if ((count ?? 0) >= 10) return json({ error: "Too many codes. Wait a few minutes." }, 429);
          await db.from("tv_remote_sessions").update({ status: "expired" }).eq("status", "pending").lt("expires_at", new Date().toISOString());
          const token = randomHex(32);
          const topic = `tv-remote:${randomHex(24)}`;
          for (let i = 0; i < 5; i++) {
            const code = randomCode();
            const { data, error } = await db.from("tv_remote_sessions").insert({
              code_hash: await sha256Hex(code), device_token_hash: await sha256Hex(token), topic,
              device_name: body.device_name ?? "TV", ip_hash: ipHash,
            }).select("id, expires_at").single();
            if (!error && data) return json({ session_id: data.id, code, device_token: token, topic, expires_at: data.expires_at });
            if (error && error.code !== "23505") { console.error("TV pair insert", error); break; }
          }
          return json({ error: "Could not create a code. Try again." }, 500);
        }

        const { data: s } = await db.from("tv_remote_sessions")
          .select("id, status, expires_at, device_token_hash").eq("id", body.session_id).maybeSingle();
        if (!s || s.device_token_hash !== (await sha256Hex(body.device_token))) return json({ error: "Unknown session" }, 404);
        const expired = new Date(s.expires_at).getTime() < Date.now();
        if (expired && s.status !== "ended" && s.status !== "expired") {
          await db.from("tv_remote_sessions").update({ status: s.status === "pending" ? "expired" : "ended", ended_at: new Date().toISOString(), ended_by: "timeout" }).eq("id", s.id);
          return json({ status: s.status === "pending" ? "expired" : "ended" });
        }

        if (body.action === "status") return json({ status: s.status, expires_at: s.expires_at });
        if (body.action === "consent") {
          if (s.status !== "claimed") return json({ status: s.status });
          const next = body.allow ? "active" : "ended";
          await db.from("tv_remote_sessions").update(body.allow
            ? { status: next, consented_at: new Date().toISOString() }
            : { status: next, ended_at: new Date().toISOString(), ended_by: "tv_declined" }).eq("id", s.id);
          await db.from("tv_remote_events").insert({ session_id: s.id, kind: body.allow ? "tv_allowed" : "tv_declined" });
          return json({ status: next });
        }
        if (body.action === "end") {
          if (s.status !== "ended") {
            await db.from("tv_remote_sessions").update({ status: "ended", ended_at: new Date().toISOString(), ended_by: "tv" }).eq("id", s.id);
            await db.from("tv_remote_events").insert({ session_id: s.id, kind: "tv_ended" });
          }
          return json({ status: "ended" });
        }
        // ice
        if (s.status !== "active" && s.status !== "claimed") return json({ error: "Session not active" }, 409);
        return json({ iceServers: await iceServers() });
      },
    },
  },
});
