import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sha256Hex } from "@/lib/enabler-handoff";

/**
 * BM Direct Install (on the TV) reports each finished step so the website wizard can tick it.
 * Authorised only by the app's PIN device token; updates the customer's latest download link.
 */
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-enabler-token", "cache-control": "no-store" };
const STAGE_COLUMN = { signed_in: "signed_in_at", permission: "permission_at", code: "code_at", completed: "completed_at" } as const;
const Body = z.object({ stage: z.enum(["signed_in", "permission", "code", "completed"]) });

export const Route = createFileRoute("/api/public/direct-install-progress")({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { status: 204, headers }),
    POST: async ({ request }) => {
      const body = Body.safeParse(await request.json().catch(() => null));
      const tok = request.headers.get("x-enabler-token");
      if (!body.success || !tok || !/^[0-9a-f]{20,200}$/i.test(tok)) return Response.json({ error: "Invalid request" }, { status: 400, headers });
      const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
      const { data: dt } = await db.from("enabler_device_tokens").select("pin_id")
        .eq("token_hash", await sha256Hex(tok)).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!dt?.pin_id) return Response.json({ error: "Please sign in again." }, { status: 401, headers });
      const { data: pin } = await db.from("enabler_login_pins").select("user_id, ticket_id").eq("id", dt.pin_id).maybeSingle();
      let owner: string | null = pin?.user_id ?? null;
      if (!owner && pin?.ticket_id) {
        const { data: t } = await db.from("tickets").select("user_id").eq("id", pin.ticket_id).maybeSingle();
        owner = t?.user_id ?? null;
      }
      if (!owner) return Response.json({ ok: true }, { headers });
      const since = new Date(Date.now() - 6 * 3600_000).toISOString();
      const { data: link } = await db.from("direct_install_links").select("id").eq("user_id", owner)
        .gt("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (link) {
        const now = new Date().toISOString();
        const patch: Record<string, string> = { [STAGE_COLUMN[body.data.stage]]: now };
        await db.from("direct_install_links").update(patch).eq("id", link.id);
      }
      return Response.json({ ok: true }, { headers });
    },
  } },
});
