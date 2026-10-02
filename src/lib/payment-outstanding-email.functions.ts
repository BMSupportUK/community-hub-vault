import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin/management only: emails the customer of an unpaid manual bank-transfer/cash order. */
export const sendPaymentOutstandingEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r) => ["admin", "management"].includes(String(r.role)))) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, email, user_id, shipping_name, existing_username, order_ref, total_cents, created_at, manual_pay_method, paid_at, completed_at, customer_type, status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Order not found");
    const method = String(order.manual_pay_method ?? "").toLowerCase();
    if (order.customer_type !== "manual" || !["bank_transfer", "bank", "cash"].includes(method)) throw new Error("Only manual bank transfer or cash orders");
    if (order.paid_at || order.completed_at) throw new Error("This order is already paid");

    let to = order.email;
    if (!to && order.user_id) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(order.user_id);
      to = u?.user?.email ?? null;
    }
    if (!to) return { sent: false, reason: "no_email" as const };

    const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
    return sendAndLogEmail(supabaseAdmin, "payment-outstanding", to, {
      templateData: {
        customerName: order.shipping_name || order.existing_username || undefined,
        orderRef: order.order_ref ?? `#${String(order.id).slice(0, 8)}`,
        amount: `£${((order.total_cents ?? 0) / 100).toFixed(2)}`,
        paymentMethod: method === "cash" ? "Cash" : "Bank transfer",
        orderDate: order.created_at ? new Date(order.created_at).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }) : undefined,
      },
      idempotencyKey: `payment-outstanding-${order.id}-${Date.now()}`,
    });
  });
