import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sha256Hex } from "@/lib/enabler-handoff";

const headers = { "cache-control": "no-store" };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });

/** Troubleshooting attaches a verified share reference to an existing ticket; Connect remains customer-owned. */
export const Route = createFileRoute("/api/public/enabler-ticket-support")({
  server: { handlers: { POST: async ({ request }) => {
    const parsed = z.object({ ticketId: z.string().uuid(), shareToken: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(await request.json().catch(() => null));
    const token = request.headers.get("x-enabler-token");
    if (!parsed.success) return reply({ error: "Invalid support connection." }, 400);
    if (!token || !/^[0-9a-f]{20,200}$/i.test(token)) return reply({ error: "Sign in with your BM TV Enabler PIN first." }, 401);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: device } = await db.from("enabler_device_tokens").select("pin_id").eq("token_hash", await sha256Hex(token)).gt("expires_at", now).maybeSingle();
    if (!device?.pin_id) return reply({ error: "Your Enabler sign-in has expired." }, 401);
    const { data: pin } = await db.from("enabler_login_pins").select("user_id,ticket_id").eq("id", device.pin_id).maybeSingle();
    let userId = pin?.user_id ?? null;
    if (!userId && pin?.ticket_id) {
      const { data: owner } = await db.from("tickets").select("user_id").eq("id", pin.ticket_id).maybeSingle();
      userId = owner?.user_id ?? null;
    }
    const { data: ticket } = await db.from("tickets").select("id,user_id,status,remote_support").eq("id", parsed.data.ticketId).maybeSingle();
    if (!userId || !ticket || ticket.user_id !== userId || ticket.status === "closed" || ticket.remote_support === false) return reply({ error: "That remote-support ticket isn't available." }, 403);
    const { data: proof } = await db.from("enabler_confirm_codes").select("code_hash,kind,used_at,expires_at,pin_id,device,bound_ticket_id,bound_order_id")
      .eq("refresh_token_hash", await sha256Hex(parsed.data.shareToken)).maybeSingle();
    if (!proof || proof.kind !== "share" || proof.used_at || Date.parse(proof.expires_at) <= Date.now() || proof.pin_id !== device.pin_id || proof.bound_order_id || (proof.bound_ticket_id && proof.bound_ticket_id !== ticket.id)) return reply({ error: "Get a fresh screen-share reference in BM TV Enabler." }, 409);
    const { data: setup } = await db.from("ticket_remote_setup").select("device").eq("ticket_id", ticket.id).maybeSingle();
    if (!setup || setup.device !== proof.device) return reply({ error: "The TV type must match your ticket." }, 409);
    const { data: result, error } = await db.rpc("apply_enabler_confirmation" as never, { _kind: "ticket", _id: ticket.id, _hash: proof.code_hash } as never);
    if (error || result !== "ok") return reply({ error: "Couldn't link this TV. Try again from your ticket." }, 409);
    return reply({ linked: true, ticketId: ticket.id });
  } } },
});