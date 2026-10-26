import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unlock } from "@/lib/checkout.server";

export const getTicketEnablerConfirmationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ ticketId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: ticket } = await context.supabase.from("tickets").select("user_id").eq("id", data.ticketId).maybeSingle();
    if (!ticket || ticket.user_id !== context.userId) throw new Error("Only the ticket customer can check this reference.");
    // Capability table is private; expose only the expiry after verifying ownership.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reference, error } = await supabaseAdmin.from("enabler_confirm_codes")
      .select("expires_at").eq("bound_ticket_id", data.ticketId)
      .gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Could not check your Enabler reference.");
    return { expires_at: reference?.expires_at ?? null };
  });

export const getOrderEnablerConfirmationStatus = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ token: z.string().min(8).max(200), password: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const access = await unlock(data.token, data.password);
    if (!access) throw new Error("Your order could not be checked.");
    const { data: reference, error } = await access.supabaseAdmin.from("enabler_confirm_codes")
      .select("expires_at").eq("bound_order_id", access.link.order_id)
      .gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Could not check your Enabler reference.");
    return { expires_at: reference?.expires_at ?? null };
  });