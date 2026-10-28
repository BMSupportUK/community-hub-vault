import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handoffUsable, normalizeHandoffCode, sha256Hex } from "@/lib/enabler-handoff";

/**
 * BM TV Enabler redeems a website code. Needs the app's PIN login token (x-enabler-token);
 * the code must belong to that same customer, be unused and under 2 hours old.
 */
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-enabler-token", "cache-control": "no-store" };
const reply = (d: unknown, status = 200) => Response.json(d, { status, headers });
const MESSAGES = {
  missing: "That code wasn't found. Check it on bmsupport.uk › Install Guides.",
  used: "That code has already been used. Make a new one on bmsupport.uk › Install Guides.",
  expired: "That code has run out (codes last 2 hours). Make a new one on bmsupport.uk › Install Guides.",
  wrong_user: "That code belongs to a different account. Sign in to the Enabler with your own PIN.",
} as const;

export const Route = createFileRoute("/api/public/enabler-handoff")({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { status: 204, headers }),
    POST: async ({ request }) => {
      const body = z.object({ code: z.string().max(20), protocol: z.number().int().optional() }).safeParse(await request.json().catch(() => null));
      const code = body.success ? normalizeHandoffCode(body.data.code) : null;
      if (!code) return reply({ error: "Type the 6-digit code from the website." }, 400);
      const tok = request.headers.get("x-enabler-token");
      if (!tok || !/^[0-9a-f]{20,200}$/i.test(tok)) return reply({ error: "Sign in to BM TV Enabler with your PIN first." }, 401);
      const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
      const { data: dt } = await db.from("enabler_device_tokens").select("pin_id")
        .eq("token_hash", await sha256Hex(tok)).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!dt?.pin_id) return reply({ error: "Your BM TV Enabler sign-in has run out. Sign in with your PIN again." }, 401);
      const { data: pin } = await db.from("enabler_login_pins").select("user_id, ticket_id").eq("id", dt.pin_id).maybeSingle();
      let userId: string | null = pin?.user_id ?? null;
      if (!userId && pin?.ticket_id) {
        const { data: t } = await db.from("tickets").select("user_id").eq("id", pin.ticket_id).maybeSingle();
        userId = t?.user_id ?? null;
      }
      const { data: row } = await db.from("enabler_handoffs").select("id, user_id, device, help_plan, app_paths, ticket_id, expires_at, used_at, purpose")
        .eq("code_hash", await sha256Hex(code)).maybeSingle();
      const verdict = handoffUsable(row, userId);
      if (verdict !== "ok" || !row) return reply({ error: MESSAGES[verdict as keyof typeof MESSAGES] }, verdict === "wrong_user" ? 403 : 404);
      if (row.purpose === "support" && (!body.success || body.data.protocol !== 2)) return reply({ error: "Update BM TV Enabler from your ticket before using this remote-support code." }, 426);
      const { data: claimed } = await db.from("enabler_handoffs").update({ used_at: new Date().toISOString() }).eq("id", row.id).is("used_at", null).select("id");
      if (!claimed?.length) return reply({ error: MESSAGES.used }, 404);
      return reply({ purpose: row.purpose, device: row.device, helpPlan: row.help_plan, apps: row.app_paths, ticketId: row.ticket_id });
    },
  } },
});
