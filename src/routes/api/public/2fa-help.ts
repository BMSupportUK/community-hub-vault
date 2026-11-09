import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  step: z.enum(["start", "number", "done"]),
  number: z.string().trim().regex(/^\d{6}$/).optional(),
});

const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "no-store" } });

// Guided 2FA help chat. The only key is the secret token in the emailed link; the account number must also match.
export const Route = createFileRoute("/api/public/2fa-help")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ dead: true });
        const { token, step, number } = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sha256Hex, newResetCode, resetLinkAlive, RESET_NUMBER_TRIES } = await import("@/lib/player-2fa-reset");
        const { data: row } = await supabaseAdmin.from("player_2fa_resets").select("id, offsite_customer_id, status, expires_at, number_failures").eq("token_hash", await sha256Hex(token)).maybeSingle();
        if (!row || !resetLinkAlive(row)) return json({ dead: true });
        const close = (status: "done" | "expired") => supabaseAdmin.from("player_2fa_resets").update({ status, code: null, closed_at: new Date().toISOString() }).eq("id", row.id);
        const { data: oc } = await supabaseAdmin.from("player_offsite_customers").select("customer_name, number").eq("id", row.offsite_customer_id).maybeSingle();
        if (!oc) { await close("expired"); return json({ dead: true }); }
        const first = (oc.customer_name || "there").split(/\s+/)[0];

        if (step === "start") return json({ name: first, stage: row.status });
        if (step === "done") { await close("done"); return json({ dead: true, finished: true }); }

        if (row.status === "reset") return json({ stage: "reset" });
        if (!number) return json({ error: "Type your 6-digit account number." }, 400);
        if (Number(number) !== Number(oc.number)) {
          const fails = row.number_failures + 1;
          if (fails >= RESET_NUMBER_TRIES) { await close("expired"); return json({ dead: true, locked: true }); }
          await supabaseAdmin.from("player_2fa_resets").update({ number_failures: fails }).eq("id", row.id);
          return json({ error: `That account number doesn't match. ${RESET_NUMBER_TRIES - fails} tries left.` }, 401);
        }
        const code = newResetCode();
        await supabaseAdmin.from("player_2fa_resets").update({ code, status: "code_issued", number_failures: 0 }).eq("id", row.id);
        return json({ code: `${code.slice(0, 4)}-${code.slice(4)}` });
      },
    },
  },
});
