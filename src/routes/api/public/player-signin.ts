import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  step: z.enum(["start", "check", "status"]),
  number: z.string().trim().regex(/^\d{6}$/).optional(),
  email: z.string().trim().toLowerCase().email().max(255).optional(),
});
const TRIES = 5;
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// BM Player sign-in chat for customers without a website account. The only key is the secret token in the
// box's QR; account number AND email must match. Once the box uses the code the address dies.
export const Route = createFileRoute("/api/public/player-signin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const p = Body.safeParse(await request.json().catch(() => null));
        if (!p.success) return json({ error: "Check the details and try again." }, 400);
        const { token, step, number, email } = p.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin.from("player_signin_chats").select("id, status, expires_at, failures, code_expires_at").eq("token_hash", await sha(token)).maybeSingle();
        const alive = row && (row.status === "open" || row.status === "code_issued") && Date.parse(row.expires_at) > Date.now();
        if (!row || !alive) return json({ dead: true, finished: row?.status === "done" });
        if (step === "start" || step === "status") return json({ stage: row.status });
        if (!number || !email) return json({ error: "Type your account number and email address." }, 400);
        const { data: oc } = await supabaseAdmin.from("player_offsite_customers").select("id, customer_name, email").eq("number", Number(number)).maybeSingle();
        if (!oc || oc.email.trim().toLowerCase() !== email) {
          const fails = row.failures + 1;
          if (fails >= TRIES) {
            await supabaseAdmin.from("player_signin_chats").update({ status: "expired", code: null, closed_at: new Date().toISOString() }).eq("id", row.id);
            return json({ dead: true, locked: true });
          }
          await supabaseAdmin.from("player_signin_chats").update({ failures: fails }).eq("id", row.id);
          return json({ error: `We couldn't find an account with that number and email. ${TRIES - fails} tries left.` }, 401);
        }
        const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
        const until = new Date(Date.now() + 10 * 60_000).toISOString();
        await supabaseAdmin.from("player_signin_chats").update({ status: "code_issued", code, code_expires_at: until, offsite_customer_id: oc.id, failures: 0 }).eq("id", row.id);
        return json({ code, name: (oc.customer_name || "there").split(/\s+/)[0], expires_at: until });
      },
    },
  },
});
