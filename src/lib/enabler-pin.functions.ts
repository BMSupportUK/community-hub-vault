import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unlock } from "@/lib/checkout.server";
import { PIN_TTL_MS, makePin, pinHash } from "@/lib/enabler-pin";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Scope = { ticket_id: string } | { order_id: string } | { user_id: string };

async function issue(db: Db, scope: Scope) {
  const col = "ticket_id" in scope ? "ticket_id" : "order_id" in scope ? "order_id" : "user_id";
  const id = "ticket_id" in scope ? scope.ticket_id : "order_id" in scope ? scope.order_id : scope.user_id;
  await db.from("enabler_login_pins").update({ revoked_at: new Date().toISOString() }).eq(col, id).is("revoked_at", null);
  for (let i = 0; i < 8; i++) {
    const pin = makePin();
    const expires_at = new Date(Date.now() + PIN_TTL_MS).toISOString();
    const { error } = await db.from("enabler_login_pins").insert({ ...scope, pin_hash: await pinHash(pin), expires_at });
    if (!error) return { pin, expires_at };
  }
  throw new Error("Couldn't make a PIN. Try again.");
}

async function status(db: Db, col: "ticket_id" | "order_id" | "user_id", id: string) {
  const { data } = await db.from("enabler_login_pins").select("expires_at").eq(col, id).is("revoked_at", null)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { expires_at: data?.expires_at ?? null };
}

/** Ticket owner only: makes a new 24-hour PIN (replacing any earlier one). */
export const createTicketEnablerPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: t } = await context.supabase.from("tickets").select("id, user_id").eq("id", data.ticketId).maybeSingle();
    if (!t || t.user_id !== context.userId) throw new Error("Only the customer on this ticket can get a PIN.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return issue(supabaseAdmin, { ticket_id: data.ticketId });
  });

/** Anyone who can see the ticket (customer or staff): when the active PIN expires — never the PIN itself. */
export const getTicketEnablerPinStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: t } = await context.supabase.from("tickets").select("id").eq("id", data.ticketId).maybeSingle();
    if (!t) return { expires_at: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return status(supabaseAdmin, "ticket_id", data.ticketId);
  });

const Access = z.object({ token: z.string().min(8).max(200), password: z.string().min(1).max(200) });

export const createOrderEnablerPin = createServerFn({ method: "POST" })
  .inputValidator((d) => Access.parse(d))
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) throw new Error("Your order could not be checked. Refresh and try again.");
    return issue(u.supabaseAdmin, { order_id: u.link.order_id as string });
  });

export const getOrderEnablerPinStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => Access.parse(d))
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) return { expires_at: null };
    return status(u.supabaseAdmin, "order_id", u.link.order_id as string);
  });

/** Signed-in customer without a ticket/order (Install Guides self install): a PIN bound to their account. */
export const createAccountEnablerPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return issue(supabaseAdmin, { user_id: context.userId });
  });

export const getAccountEnablerPinStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return status(supabaseAdmin, "user_id", context.userId);
  });
