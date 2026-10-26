import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Called by BM TV Enabler and the BM Support phone app after they have checked the
 * TV over Wi-Fi debugging. The caller proves itself only with the 8-digit setup code
 * the ticket customer was shown (stored hashed, 2 h expiry). Returns no personal data.
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
const json = (d: unknown, status = 200) => Response.json(d, { status, headers: CORS });

const Body = z.object({
  code: z.string().regex(/^\d{8}$/),
  app: z.string().max(40).optional(),
  device: z.enum(["amazon", "android"]).optional(),
  helperCode: z.string().regex(/^\d{6}$/).optional(),
  checks: z.object({ adb: z.boolean(), helper: z.boolean(), control: z.boolean(), accessibility: z.boolean() }),
});

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/remote-setup")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid request" }, 400);
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
        const ipHash = await sha256Hex(`setup:${ip}`);
        const since = new Date(Date.now() - 15 * 60_000).toISOString();
        const { count } = await db.from("tv_helper_diagnostics").select("id", { count: "exact", head: true })
          .eq("ip_hash", ipHash).eq("step", "setup_report").gte("created_at", since);
        if ((count ?? 0) >= 20) return json({ error: "Too many tries. Wait 15 minutes." }, 429);
        await db.from("tv_helper_diagnostics").insert({ ip_hash: ipHash, helper_version: parsed.data.app ?? null, step: "setup_report", message: JSON.stringify(parsed.data.checks) });

        const hash = await sha256Hex(parsed.data.code);
        // A setup code belongs to either a support ticket or a secure order.
        const now = new Date();
        const { data: t } = await db.from("ticket_remote_setup").select("ticket_id, device, setup_code_expires_at").eq("setup_code_hash", hash).maybeSingle();
        const { data: o } = t ? { data: null } : await db.from("order_remote_setup").select("order_id, device, setup_code_expires_at").eq("setup_code_hash", hash).maybeSingle();
        const row = t ?? o;
        if (!row || !row.setup_code_expires_at || new Date(row.setup_code_expires_at) < now)
          return json({ error: "That setup code isn't valid. Check the code on your Remote setup tab." }, 404);
        if (parsed.data.device && row.device && parsed.data.device !== row.device)
          return json({ error: "Device type doesn't match the setup" }, 409);
        // Optional live BM Remote Helper code read off the TV: the website then offers a Connect button.
        let sessionId: string | null = null;
        if (parsed.data.helperCode) {
          const { data: s } = await db.from("tv_remote_sessions").select("id").eq("code_hash", await sha256Hex(parsed.data.helperCode))
            .eq("status", "pending").gt("expires_at", now.toISOString()).is("link_id", null).maybeSingle();
          sessionId = s?.id ?? null;
        }
        const patch = { app_checks: parsed.data.checks, app_checked_at: now.toISOString(), pending_session_id: sessionId, updated_at: now.toISOString() };
        const result = t
          ? await db.from("ticket_remote_setup").update(patch).eq("ticket_id", t.ticket_id).eq("setup_code_hash", hash).gt("setup_code_expires_at", now.toISOString()).select("ticket_id")
          : o ? await db.from("order_remote_setup").update(patch).eq("order_id", o.order_id).eq("setup_code_hash", hash).gt("setup_code_expires_at", now.toISOString()).select("order_id") : null;
        if (!result || result.error) return json({ error: "Couldn't save TV checks. Try again." }, 503);
        if (!result.data?.length) return json({ error: "That setup code is no longer valid. Show a new code on Remote setup." }, 404);
        return json({ ok: true, helperLinked: !!sessionId });
      },
    },
  },
});
