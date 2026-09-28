import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Permanently delete an order (used for test orders). Admin only.
 * order_items / order_messages / order_payments cascade; invoices and the
 * linked support ticket are removed explicitly.
 */
export const deleteOrderCompletely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tickets } = await supabaseAdmin
      .from("tickets")
      .select("id")
      .eq("order_id", data.orderId);
    const ticketIds = (tickets ?? []).map((t: { id: string }) => t.id);
    if (ticketIds.length > 0) {
      await supabaseAdmin.from("ticket_messages").delete().in("ticket_id", ticketIds);
      await supabaseAdmin.from("tickets").delete().in("id", ticketIds);
    }

    await supabaseAdmin.from("order_invoices").delete().eq("order_id", data.orderId);

    const { error } = await supabaseAdmin.schema("private").from("orders").delete().eq("id", data.orderId);
    if (error) throw new Error(error.message);

    return { deleted: true, ticketsDeleted: ticketIds.length };
  });
