import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PIN_LOCK_MS, PIN_MAX_TRIES, pinHash, pinUsable, sha256Hex } from "@/lib/enabler-pin";

/**
 * BM TV Enabler login: the app sends the 6-digit PIN the customer got on their ticket/order.
 * Success returns a random device token that unlocks the app until the PIN's 24 hours end.
 * Returns no personal data. 5 wrong tries per address lock out for 15 minutes.
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
const json = (d: unknown, status = 200) => Response.json(d, { status, headers: CORS });
const Body = z.object({ pin: z.string().regex(/^\d{6}$/).optional(), token: z.string().min(20).max(200).optional(), app: z.string().max(40).optional() });

export const Route = createFileRoute("/api/public/enabler-login")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success || (!parsed.data.pin && !parsed.data.token)) return json({ error: "Type the 6-digit PIN." }, 400);
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        // Token check: lets the app confirm a saved login is still valid.
        if (parsed.data.token) {
          const { data: t } = await db.from("enabler_device_tokens").select("expires_at, enabler_login_pins(revoked_at, expires_at)")
            .eq("token_hash", await sha256Hex(parsed.data.token)).maybeSingle();
          const pin = (t as unknown as { enabler_login_pins: { revoked_at: string | null; expires_at: string } | null } | null)?.enabler_login_pins;
          if (!t || !pin || !pinUsable(pin) || new Date(t.expires_at).getTime() <= Date.now()) return json({ ok: false }, 401);
          return json({ ok: true, expiresAt: t.expires_at });
        }
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
        const ipHash = await sha256Hex(`pin:${ip}`);
        const { count } = await db.from("tv_helper_diagnostics").select("id", { count: "exact", head: true })
          .eq("ip_hash", ipHash).eq("step", "enabler_pin_fail").gte("created_at", new Date(Date.now() - PIN_LOCK_MS).toISOString());
        if ((count ?? 0) >= PIN_MAX_TRIES) return json({ error: "Too many wrong PINs. Wait 15 minutes and try again." }, 429);
        const { data: row } = await db.from("enabler_login_pins").select("id, expires_at, revoked_at").eq("pin_hash", await pinHash(parsed.data.pin!)).maybeSingle();
        if (!row || !pinUsable(row)) {
          await db.from("tv_helper_diagnostics").insert({ ip_hash: ipHash, helper_version: parsed.data.app ?? null, step: "enabler_pin_fail", message: "bad pin" });
          return json({ error: "PIN not recognised. Check the PIN on your ticket or order — it lasts 24 hours." }, 401);
        }
        const raw = new Uint8Array(32); crypto.getRandomValues(raw);
        const token = [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
        const { error } = await db.from("enabler_device_tokens").insert({ pin_id: row.id, token_hash: await sha256Hex(token), expires_at: row.expires_at });
        if (error) return json({ error: "Couldn't log in. Try again." }, 503);
        return json({ token, expiresAt: row.expires_at });
      },
    },
  },
});
