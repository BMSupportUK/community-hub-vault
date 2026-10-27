import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CONFIRM_TTL_MS, makeConfirmCode, formatConfirmCode } from "@/lib/enabler-confirm-code";

/**
 * Called by BM TV Enabler (phone/Windows) once it has confirmed the TV. Returns a short
 * reusable code the customer types on their ticket/order Remote setup tab. Stores only
 * a hash plus the TV checks and type — no personal data.
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
const json = (d: unknown, status = 200) => Response.json(d, { status, headers: CORS });
const Body = z.object({
  app: z.string().max(40).optional(),
  device: z.enum(["amazon", "android"]),
  // "share" confirms the TV for screen sharing; "install" only confirms the apps are on the TV.
  kind: z.enum(["share", "install"]).optional(),
  helperCode: z.string().regex(/^\d{6}$/).optional(),
  checks: z.object({ adb: z.boolean(), helper: z.boolean(), control: z.boolean(), accessibility: z.boolean() }),
});
async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/enabler-confirm")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid request" }, 400);
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
        const ipHash = await sha256Hex(`setup:${ip}`);
        const { count } = await db.from("tv_helper_diagnostics").select("id", { count: "exact", head: true })
          .eq("ip_hash", ipHash).eq("step", "enabler_confirm").gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
        if ((count ?? 0) >= 20) return json({ error: "Too many tries. Wait 15 minutes." }, 429);
        await db.from("tv_helper_diagnostics").insert({ ip_hash: ipHash, helper_version: parsed.data.app ?? null, step: "enabler_confirm", message: JSON.stringify(parsed.data.checks) });
        const kind = parsed.data.kind ?? "share";
        // Optional live BM Remote Helper code read off the TV: keep only the pending session it points to.
        // Install references never attach a screen-share session.
        let sessionId: string | null = null;
        if (kind === "share" && parsed.data.helperCode) {
          const { data: s } = await db.from("tv_remote_sessions").select("id").eq("code_hash", await sha256Hex(parsed.data.helperCode))
            .eq("status", "pending").gt("expires_at", new Date().toISOString()).is("link_id", null).maybeSingle();
          sessionId = s?.id ?? null;
        }
        for (let i = 0; i < 5; i++) {
          const code = makeConfirmCode();
          const expiresAt = new Date(Date.now() + CONFIRM_TTL_MS).toISOString();
          const refreshToken = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, "0")).join("");
          const { error } = await db.from("enabler_confirm_codes").insert({
            code_hash: await sha256Hex(code), device: parsed.data.device, checks: parsed.data.checks, kind,
            app: parsed.data.app ?? null, session_id: sessionId, expires_at: expiresAt,
            refresh_token_hash: await sha256Hex(refreshToken), reference_display: formatConfirmCode(code),
          });
          if (!error) return json({ code, helperLinked: !!sessionId, expiresAt, expiresAtMs: Date.parse(expiresAt), refreshToken });
        }
        return json({ error: "Couldn't make a code. Try again." }, 503);
      },
    },
  },
});
