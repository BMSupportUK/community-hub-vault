import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { clientIpFromHeaders, deviceFromUserAgent } from "@/lib/device-from-user-agent";

/**
 * BM TV Enabler calls this when the customer says they don't need staff help after
 * "Install our apps". Logs the install code, the apps installed and the TV's local address
 * in the download log, then marks the code used so the app can offer New code.
 * Authorised only by the code's private 64-hex token, never the short reference.
 */
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-enabler-token", "cache-control": "no-store" };
const Body = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  apps: z.array(z.string().min(1).max(80)).max(40),
  tvAddress: z.string().regex(/^\d{1,3}(\.\d{1,3}){3}(:\d{1,5})?$/).optional(),
});
async function hash(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/enabler-self-install")({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { status: 204, headers }),
    POST: async ({ request }) => {
      const body = Body.safeParse(await request.json().catch(() => null));
      if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400, headers });
      const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
      const { data: row } = !body.data.token ? { data: null } : await db.from("enabler_confirm_codes").select("code_hash, kind, used_at, reference_display, app")
        .eq("refresh_token_hash", await hash(body.data.token!)).maybeSingle();
      if (body.data.token && (!row || row.kind !== "install")) return Response.json({ error: "Code not found" }, { status: 404, headers });
      if (!row || row.used_at) { /* already logged */ } else {
      const { error: upd } = await db.from("enabler_confirm_codes").update({ used_at: new Date().toISOString() })
        .eq("code_hash", row.code_hash).is("used_at", null);
      if (upd) return Response.json({ error: "Couldn't log the install. Try again." }, { status: 503, headers });
      const ua = request.headers.get("user-agent");
      const { error: logErr } = await db.from("app_download_log").insert({
        source: "self_install",
        app_name: body.data.apps.length ? body.data.apps.join(", ") : "No apps",
        version_name: row.app,
        enabler_reference: row.reference_display,
        tv_address: body.data.tvAddress ?? null,
        ip: clientIpFromHeaders(request.headers),
        user_agent: ua?.slice(0, 400) ?? null,
        device: deviceFromUserAgent(ua),
      });
      if (logErr) console.error("self-install download log insert failed:", logErr);
      }
      // Tell the website's Install Guides that this customer's redeemed self-install code finished.
      const tok = request.headers.get("x-enabler-token");
      if (tok && /^[0-9a-f]{20,200}$/i.test(tok)) {
        const { data: dt } = await db.from("enabler_device_tokens").select("pin_id")
          .eq("token_hash", await hash(tok)).gt("expires_at", new Date().toISOString()).maybeSingle();
        const { data: pin } = dt?.pin_id ? await db.from("enabler_login_pins").select("user_id").eq("id", dt.pin_id).maybeSingle() : { data: null };
        if (pin?.user_id) {
          const since = new Date(Date.now() - 3 * 3600_000).toISOString();
          const { data: h } = await db.from("enabler_handoffs").select("id").eq("user_id", pin.user_id).eq("purpose", "install")
            .not("used_at", "is", null).gt("used_at", since).is("completed_at", null).order("used_at", { ascending: false }).limit(1).maybeSingle();
          if (h) await db.from("enabler_handoffs").update({ completed_at: new Date().toISOString(), completed_apps: body.data.apps }).eq("id", h.id);
        }
      }
      return Response.json({ ok: true }, { headers });
    },
  } },
});
