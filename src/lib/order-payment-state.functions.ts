import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getOrderPaymentState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "management"]);

    const { data: visibleOrder, error: orderError } = await context.supabase
      .from("orders")
      .select("id,user_id,paid_at,status,total_cents")
      .eq("id", data.orderId)
      .maybeSingle();

    if (orderError || !visibleOrder) throw new Error(orderError?.message || "Order not found");
    const isStaff = Boolean(roles?.length);
    if (!isStaff && visibleOrder.user_id !== context.userId) throw new Error("Not authorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await supabaseAdmin
      .from("order_payments")
      .select("provider,provider_payment_id,status,amount_cents,card_brand,last_4")
      .eq("order_id", data.orderId)
      .maybeSingle();

    const paymentStatus = String(payment?.status ?? "").toLowerCase();
    const paymentSettled = ["paid", "completed", "captured", "finished"].includes(paymentStatus);
    const amountMatches = Number(payment?.amount_cents ?? -1) === Number(visibleOrder.total_cents ?? 0);
    const settled = Boolean(visibleOrder.paid_at || (paymentSettled && amountMatches));

    // This does not contact or confirm with a payment provider. It only repairs
    // an order whose locally stored payment has already been confirmed.
    let paidAt = visibleOrder.paid_at;
    if (!paidAt && paymentSettled && amountMatches) {
      paidAt = new Date().toISOString();
      const patch: { paid_at: string; paid_by: string; status?: "paid" } = {
        paid_at: paidAt,
        paid_by: context.userId,
      };
      if (visibleOrder.status !== "completed" && visibleOrder.status !== "cancelled") patch.status = "paid";
      const { error: syncError } = await supabaseAdmin.from("orders").update(patch).eq("id", data.orderId);
      if (syncError) throw new Error(syncError.message);
    }

    return {
      settled,
      paidAt,
      provider: payment?.provider ?? null,
      providerPaymentId: payment?.provider_payment_id ?? null,
      paymentStatus: payment?.status ?? null,
      cardBrand: payment?.card_brand ?? null,
      last4: payment?.last_4 ?? null,
    };
  });