import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * BM TV Enabler "Yes — I need staff help".
 *  - mode "check": is the office open? (asked before anything installs)
 *  - mode "create": after the apps are installed and the TV is set up for screen sharing,
 *    opens a General ticket for the signed-in customer, attaches the fresh sharing reference
 *    and raises the screen-share request so staff can connect straight away.
 * The customer is identified only by the app's PIN login token (x-enabler-token); the sharing
 * reference is proven by its private 64-hex token and must belong to that same login.
 */
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-enabler-token", "cache-control": "no-store" };
const reply = (d: unknown, status = 200) => Response.json(d, { status, headers });
const Body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("check") }),
  z.object({
    mode: z.literal("create"),
    shareToken: z.string().regex(/^[0-9a-f]{64}$/),
    device: z.enum(["amazon", "android"]),
    apps: z.array(z.string().min(1).max(80)).max(40),
    ticketId: z.string().uuid().optional(),
  }),
]);
const STAFF_HELP_TICKET_SUBJECT = "Help installing apps on my TV (BM TV Enabler)";
async function hash(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/enabler-staff-help")({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { status: 204, headers }),
    POST: async ({ request }) => {
      const body = Body.safeParse(await request.json().catch(() => null));
      if (!body.success) return reply({ error: "Invalid request" }, 400);
      const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
      const { data: open } = await db.rpc("is_business_open");
      if (body.data.mode === "check") return reply({ open: open === true });
      if (open !== true) return reply({ error: "Our office is closed right now, so staff help isn't available. Choose No to install the apps yourself, or try again when we're open." }, 409);

      // Who is this? Only the PIN login token from this app session can say.
      const tok = request.headers.get("x-enabler-token");
      if (!tok || !/^[0-9a-f]{20,200}$/i.test(tok)) return reply({ error: "Sign in to BM TV Enabler with your PIN first." }, 401);
      const { data: dt } = await db.from("enabler_device_tokens").select("pin_id")
        .eq("token_hash", await hash(tok)).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!dt?.pin_id) return reply({ error: "Your BM TV Enabler sign-in has run out. Close the app and sign in with your PIN again." }, 401);
      const { data: pin } = await db.from("enabler_login_pins").select("user_id, ticket_id, order_id").eq("id", dt.pin_id).maybeSingle();
      let userId: string | null = pin?.user_id ?? null;
      if (!userId && pin?.ticket_id) {
        const { data: t } = await db.from("tickets").select("user_id").eq("id", pin.ticket_id).maybeSingle();
        userId = t?.user_id ?? null;
      }
      if (!userId) return reply({ error: "Use the BM TV Enabler PIN from your account Settings on bmsupport.uk so we know whose ticket to open." }, 403);

      // The sharing reference must be fresh, unused and issued to this same login.
      const { data: code } = await db.from("enabler_confirm_codes").select("code_hash, kind, used_at, expires_at, pin_id, device")
        .eq("refresh_token_hash", await hash(body.data.shareToken)).maybeSingle();
      if (!code || code.kind !== "share" || code.used_at || Date.parse(code.expires_at) <= Date.now() || code.pin_id !== dt.pin_id)
        return reply({ error: "This screen-share code can't be used. Press Return to home and try again." }, 404);

      let ticket: { id: string } | null = null;
      if (body.data.ticketId) {
        // Ticket already opened on the website: attach screen sharing to it.
        const { data: t } = await db.from("tickets").select("id, user_id, status").eq("id", body.data.ticketId).maybeSingle();
        if (!t || t.user_id !== userId || t.status === "closed") return reply({ error: "Your help ticket is closed. Make a new code on bmsupport.uk › Install Guides." }, 404);
        ticket = { id: t.id };
        await db.from("ticket_messages").insert({ ticket_id: t.id, sender_id: userId, is_internal: false,
          content: "BM TV Enabler has set up screen sharing on my TV, so you can connect from the Screen share tab and install the apps for me." });
      } else {
        // Stop accidental repeat taps opening a pile of tickets.
        const { count } = await db.from("tickets").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("subject", STAFF_HELP_TICKET_SUBJECT).gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
        if ((count ?? 0) >= 3) return reply({ error: "You've just opened a help ticket. Check your tickets at bmsupport.uk — our staff will be with you shortly." }, 429);

        const { data: cat } = await db.from("ticket_categories").select("id").eq("slug", "general").maybeSingle();
        if (!cat) return reply({ error: "Couldn't open a ticket. Try again." }, 503);
        const { data: created, error: tErr } = await db.from("tickets")
          .insert({ user_id: userId, subject: STAFF_HELP_TICKET_SUBJECT, category_id: cat.id, priority: "normal" })
          .select("id").single();
        if (tErr || !created) return reply({ error: "Couldn't open a ticket. Try again." }, 503);
        const appsLine = body.data.apps.length ? body.data.apps.join(", ") : "none";
        await db.from("ticket_messages").insert({
          ticket_id: created.id, sender_id: userId, is_internal: false,
          content: `Hi,\n\nI'd like help from a member of staff with the BM apps on my ${body.data.device === "amazon" ? "Amazon Fire TV" : "Android / Google TV"}.\n\nBM TV Enabler has already set up screen sharing on my TV, so you can connect from the Screen share tab.\n\nApps installed: ${appsLine}\n\nThank you!`,
        });
        ticket = created;
      }
      if (!ticket) return reply({ error: "Couldn't open a ticket. Try again." }, 503);
      // Same as the ticket's Remote setup tab: device first, then the reference, then the request.
      await db.from("ticket_remote_setup").upsert({ ticket_id: ticket.id, device: code.device, confirmed_steps: [], app_checks: {}, updated_at: new Date().toISOString() }, { onConflict: "ticket_id" });
      const { data: applied } = await db.rpc("apply_enabler_confirmation" as never, { _kind: "ticket", _id: ticket.id, _hash: code.code_hash } as never);
      let connected = false;
      if (applied === "ok") {
        const { data: c } = await db.rpc("consume_enabler_connection" as never, { _kind: "ticket", _id: ticket.id } as never);
        connected = c === true;
      }
      return reply({ ok: true, ticketId: ticket.id, connected, linked: applied === "ok" });
    },
  } },
});
