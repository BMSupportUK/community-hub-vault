import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { enablerReferenceUsed } from "@/lib/enabler-confirm-code";

const Body = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  requestId: z.string().uuid().optional(),
  helperCode: z.string().regex(/^\d{6}$/).optional(),
  checks: z.object({ adb: z.boolean(), helper: z.boolean(), control: z.boolean(), accessibility: z.boolean() }).optional(),
});
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "cache-control": "no-store" };
async function hash(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, "0")).join("");
}
export const Route = createFileRoute("/api/public/enabler-refresh")({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { status: 204, headers }),
    POST: async ({ request }) => {
      const body = Body.safeParse(await request.json().catch(() => null));
      if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400, headers });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const tokenHash = await hash(body.data.token);
      // Unpredictable per-confirmation capability, never the short customer reference.
      const { data: authority } = await supabaseAdmin.from("enabler_confirm_codes").select("expires_at,used_at,bound_ticket_id,bound_order_id").eq("refresh_token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!authority) return Response.json({ state: "expired" }, { status: 403, headers });
      const { data, error } = await supabaseAdmin.rpc("enabler_refresh_task", {
        _token_hash: tokenHash, _request_id: body.data.requestId ?? undefined,
        _helper_hash: body.data.helperCode ? await hash(body.data.helperCode) : undefined,
        _checks: body.data.checks,
      });
      const result = data && typeof data === "object" && !Array.isArray(data) ? data : { state: "failed" };
      return Response.json(error ? { state: "failed" } : { ...result, referenceUsed: enablerReferenceUsed(authority) }, { status: error ? 503 : 200, headers });
    },
  } },
});