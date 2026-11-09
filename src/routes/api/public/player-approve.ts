import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), approve: z.boolean().optional(), check: z.boolean().optional() });

async function sha256(s: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Emailed one-time BM Player login approval for customers without a website account.
// The token itself is the credential: hashed at rest, single use, 10-minute life.
export const Route = createFileRoute("/api/public/player-approve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "This link isn't valid." }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = await sha256(parsed.data.token);
        const { data: a } = await supabaseAdmin.from("player_login_approvals" as any)
          .select("id, device_id, status, created_at").eq("token_hash", hash).maybeSingle() as any;
        if (!a || a.status !== "pending" || Date.now() - Date.parse(a.created_at) > 10 * 60_000)
          return Response.json({ error: "This link has expired or was already used. Open BM Player again for a new email." }, { status: 410 });
        const { data: d } = await supabaseAdmin.from("player_devices").select("platform").eq("id", a.device_id).maybeSingle();
        if (parsed.data.check) return Response.json({ ok: true, device: d?.platform ?? "BM Player" });
        const approve = parsed.data.approve === true;
        const { data: upd } = await supabaseAdmin.from("player_login_approvals" as any)
          .update({ status: approve ? "approved" : "denied", decided_at: new Date().toISOString(), decided_by: "email" })
          .eq("id", a.id).eq("status", "pending").select("id") as any;
        if (!upd?.length) return Response.json({ error: "This link was already used." }, { status: 410 });
        if (approve) await supabaseAdmin.from("player_devices").update({ remote_unlock_at: new Date().toISOString(), unlock_failures: 0, unlock_locked_until: null }).eq("id", a.device_id);
        return Response.json({ ok: true, status: approve ? "approved" : "denied" });
      },
    },
  },
});
