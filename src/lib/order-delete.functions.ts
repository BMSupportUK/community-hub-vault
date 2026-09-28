import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Permanently delete an order (used for test orders). Admin only — the
 * database function checks the admin role and removes the order plus its
 * items, messages, payments, invoices and linked support ticket.
 */
export const deleteOrderCompletely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase as any).rpc("admin_delete_order", {
      _order_id: data.orderId,
    });
    if (error) {
      console.error("[deleteOrderCompletely]", error.message);
      throw new Error(error.message);
    }
    return result as { deleted: boolean; ticketsDeleted: number };
  });
