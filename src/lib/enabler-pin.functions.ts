import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unlock } from "@/lib/checkout.server";
import { makePin, pinHash } from "@/lib/enabler-pin";
import { decryptPin, encryptPin } from "@/lib/enabler-pin-crypto.server";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Scope = { ticket_id: string } | { order_id: string } | { user_id: string };

async function issue(db: Db, scope: Scope) {
  const col = "ticket_id" in scope ? "ticket_id" : "order_id" in scope ? "order_id" : "user_id";
  const id = "ticket_id" in scope ? scope.ticket_id : "order_id" in scope ? scope.order_id : scope.user_id;
  const secret = process.env["ENABLER_PIN_ENCRYPTION_KEY"] ?? "";
  for (let i = 0; i < 8; i++) {
    const pin = makePin();
    const { data, error } = await db.rpc("get_or_create_enabler_login_pin", {
      _scope: col, _id: id, _pin_hash: await pinHash(pin), _pin_encrypted: await encryptPin(pin, secret),
    });
    if (error?.code === "23505") continue;
    if (error) throw new Error("Couldn't get your PIN. Try again.");
    const row = z.object({ pin_encrypted: z.string().nullable(), expires_at: z.string() }).parse(data);
    if (!row.pin_encrypted) throw new Error("Your existing PIN is still valid. Use the device where you requested it until it expires.");
    return { pin: await decryptPin(row.pin_encrypted, secret), expires_at: row.expires_at };
  }
  throw new Error("Couldn't make a PIN. Try again.");
}

async function status(db: Db, col: "ticket_id" | "order_id" | "user_id", id: string, owner = false) {
  const { data, error } = await db.from("enabler_login_pins").select("expires_at, pin_encrypted").eq(col, id).is("revoked_at", null)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Couldn't check your PIN. Try again.");
  const pin = owner && data?.pin_encrypted ? await decryptPin(data.pin_encrypted, process.env["ENABLER_PIN_ENCRYPTION_KEY"] ?? "") : undefined;
  return { expires_at: data?.expires_at ?? null, ...(pin ? { pin } : {}) };
}

/** Ticket owner only: reuses the active PIN, creating one only after expiry. */
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
    const { data: t } = await context.supabase.from("tickets").select("id, user_id").eq("id", data.ticketId).maybeSingle();
    if (!t) return { expires_at: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return status(supabaseAdmin, "ticket_id", data.ticketId, t.user_id === context.userId);
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
    return status(u.supabaseAdmin, "order_id", u.link.order_id as string, true);
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
    return status(supabaseAdmin, "user_id", context.userId, true);
  });

/** Owner only: reveal the active PIN and send it to the user's notifications. */
export const revealEnablerPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ticketId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.ticketId) {
      const { data: t } = await context.supabase.from("tickets").select("id, user_id").eq("id", data.ticketId).maybeSingle();
      if (!t || t.user_id !== context.userId) throw new Error("Only the customer on this ticket can reveal the PIN.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const s = data.ticketId ? await status(supabaseAdmin, "ticket_id", data.ticketId, true) : await status(supabaseAdmin, "user_id", context.userId, true);
    if (!s.expires_at) throw new Error("There's no valid PIN. Get a new one.");
    if (!s.pin) throw new Error("This older PIN can't be revealed. Use the device where you requested it until it expires.");
    return { pin: s.pin, expires_at: s.expires_at };
  });

/** Signed-in customer: cancel their current account PIN and issue a fresh 24-hour one. */
export const resetAccountEnablerPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("enabler_login_pins").update({ revoked_at: new Date().toISOString() } as never)
      .eq("user_id", context.userId).is("revoked_at", null);
    if (error) throw new Error("Couldn't reset your PIN. Try again.");
    return issue(supabaseAdmin, { user_id: context.userId });
  });

/** True once BM TV Enabler has signed in (PIN swapped for a live device token) with this ticket's or its customer's PIN. */
export const getTicketEnablerLoggedIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: only the ticket's customer or staff who can see the ticket get past this read.
    const { data: t } = await context.supabase.from("tickets").select("id, user_id").eq("id", data.ticketId).maybeSingle();
    if (!t) return { loggedIn: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: pins } = await supabaseAdmin.from("enabler_login_pins").select("id")
      .or(`ticket_id.eq.${t.id},user_id.eq.${t.user_id}`).is("revoked_at", null).gt("expires_at", now);
    const ids = (pins ?? []).map((p) => p.id);
    if (!ids.length) return { loggedIn: false, tvFound: false };
    const { count } = await supabaseAdmin.from("enabler_device_tokens").select("id", { count: "exact", head: true }).in("pin_id", ids).gt("expires_at", now);
    // TV found = this customer's signed-in app produced a share check in the last 2 hours that isn't tied to another ticket/order.
    const { data: codes } = await supabaseAdmin.from("enabler_confirm_codes").select("checks, bound_ticket_id, bound_order_id")
      .in("pin_id", ids).eq("kind", "share").gt("expires_at", now)
      .gt("created_at", new Date(Date.now() - 2 * 3600_000).toISOString()).order("created_at", { ascending: false }).limit(5);
    const tvFound = (codes ?? []).some((c) => {
      const k = (c.checks ?? {}) as Record<string, boolean>;
      const free = (!c.bound_ticket_id || c.bound_ticket_id === t.id) && !c.bound_order_id;
      return free && k.adb && k.helper && k.control && k.accessibility;
    });
    return { loggedIn: (count ?? 0) > 0, tvFound };
  });
