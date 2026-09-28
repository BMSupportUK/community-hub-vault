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
      const { error: ticketMessagesError } = await supabaseAdmin
        .from("ticket_messages")
        .delete()
        .in("ticket_id", ticketIds);
      if (ticketMessagesError) throw new Error(ticketMessagesError.message);
      const { error: ticketsError } = await supabaseAdmin.from("tickets").delete().in("id", ticketIds);
      if (ticketsError) throw new Error(ticketsError.message);
    }

    for (const table of ["order_invoices", "order_items", "order_messages", "order_payments"] as const) {
      const { error } = await supabaseAdmin.from(table).delete().eq("order_id", data.orderId);
      if (error) throw new Error(error.message);
    }

    const { error: wiseError } = await supabaseAdmin
      .from("wise_email_payments")
      .update({ matched_order_id: null })
      .eq("matched_order_id", data.orderId);
    if (wiseError) throw new Error(wiseError.message);

    const privateAdmin = supabaseAdmin as unknown as {
      schema: (name: "private") => {
        from: (table: "orders") => {
          delete: () => { eq: (column: "id", value: string) => Promise<{ error: { message: string } | null }> };
        };
      };
    };
    const { error } = await privateAdmin.schema("private").from("orders").delete().eq("id", data.orderId);
    if (error) throw new Error(error.message);

    return { deleted: true, ticketsDeleted: ticketIds.length };
  });
