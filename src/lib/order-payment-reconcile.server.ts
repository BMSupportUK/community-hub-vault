import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isSettledPaymentStatus } from "@/lib/payment-status";
import { type StripeEnv, createStripeClient } from "@/lib/stripe.server";

// Safety-net reconciliation for orders whose payment completed at the
// provider but whose paid flag never got written locally (e.g. the customer
// closed the browser before the post-checkout confirmation call ran, or the
// confirmation request failed).
//
// Called every minute from /api/public/hooks/scheduled-reminders. For each
// recent unpaid order it:
//   1. Repairs orders whose stored payment row is already settled (pure DB
//      fix, no provider contact).
//   2. Asks Stripe directly about pending checkout sessions and marks the
//      order paid when Stripe reports the session as paid.
// Stripe lookups are capped per run so a backlog can't blow the cron budget.

const MAX_STRIPE_LOOKUPS_PER_RUN = 5;
const STRIPE_LOOKUP_WINDOW_HOURS = 24;
const REPAIR_WINDOW_HOURS = 72;

type UnpaidOrder = {
  id: string;
  user_id: string | null;
  total_cents: number | null;
  status: string | null;
  created_at: string | null;
};

async function markOrderPaid(order: UnpaidOrder, transactionId: string | null): Promise<string> {
  const paidAt = new Date().toISOString();
  const { error: rpcErr } = await supabaseAdmin.rpc("mark_order_paid" as never, {
    p_order_id: order.id,
    p_transaction_id: transactionId ?? order.id,
  } as never);
  if (rpcErr) {
    const patch: Record<string, string> = { paid_at: paidAt };
    if (order.status !== "completed" && order.status !== "cancelled") patch.status = "paid";
    const { error: updErr } = await supabaseAdmin.from("orders").update(patch as never).eq("id", order.id);
    if (updErr) throw new Error(updErr.message);
  }
  return paidAt;
}

async function postNotice(order: UnpaidOrder, provider: string, reference: string | null, paidAt: string, amountCents: number) {
  try {
    const { postOrderPaymentReceivedNotice } = await import("@/lib/order-payment-notice.server");
    await postOrderPaymentReceivedNotice({
      orderId: order.id,
      provider: provider === "square" ? "Square" : provider === "stripe" ? "Stripe" : provider || "card",
      amountCents,
      reference,
      actorId: order.user_id,
      paidAt,
    });
  } catch (e) {
    console.error("[payment-reconcile] notice failed", order.id, e);
  }
}

export async function reconcileUnpaidOrders(): Promise<{ scanned: number; repaired: number; stripeChecked: number }> {
  const since = new Date(Date.now() - REPAIR_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: orders, error } = await supabaseAdmin
    .from("orders")
    .select("id,user_id,total_cents,status,created_at")
    .is("paid_at", null)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("[payment-reconcile] order scan failed", error.message);
    return { scanned: 0, repaired: 0, stripeChecked: 0 };
  }

  let repaired = 0;
  let stripeChecked = 0;
  const stripeCutoff = Date.now() - STRIPE_LOOKUP_WINDOW_HOURS * 60 * 60 * 1000;

  for (const order of (orders ?? []) as UnpaidOrder[]) {
    const totalCents = Number(order.total_cents ?? 0);
    try {
      const { data: payment } = await supabaseAdmin
        .from("order_payments")
        .select("provider,provider_payment_id,status,amount_cents,card_brand,last_4,receipt_url")
        .eq("order_id", order.id)
        .maybeSingle();

      // Path 1: stored payment already settled — just repair the order row.
      if (payment && isSettledPaymentStatus(payment.status) && Number(payment.amount_cents ?? -1) === totalCents) {
        const paidAt = await markOrderPaid(order, payment.provider_payment_id ? String(payment.provider_payment_id) : null);
        await postNotice(order, String(payment.provider ?? "card"), payment.provider_payment_id ? String(payment.provider_payment_id) : null, paidAt, totalCents);
        repaired++;
        console.log(`[payment-reconcile] repaired order ${order.id} from settled ${payment.provider} payment`);
        continue;
      }

      // Path 2: ask Stripe about an incomplete checkout session.
      const sessionId = payment?.provider === "stripe" ? String(payment.provider_payment_id ?? "") : "";
      const createdMs = order.created_at ? new Date(order.created_at).getTime() : 0;
      if (
        sessionId.startsWith("cs_") &&
        createdMs >= stripeCutoff &&
        stripeChecked < MAX_STRIPE_LOOKUPS_PER_RUN
      ) {
        stripeChecked++;
        const stripe = createStripeClient((process.env.STRIPE_ENVIRONMENT as StripeEnv) ?? "sandbox");
        const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
        if (session.payment_status !== "paid") continue;
        if (Number(session.amount_total) !== totalCents) {
          console.error(`[payment-reconcile] amount mismatch on order ${order.id}: stripe=${session.amount_total} local=${totalCents}`);
          continue;
        }

        const pi = session.payment_intent as { id?: string; charges?: { data?: { payment_method_details?: { card?: { brand?: string; last4?: string } }; receipt_url?: string }[] } } | null;
        const charge = pi?.charges?.data?.[0];
        const cardBrand = charge?.payment_method_details?.card?.brand ?? null;
        const last4 = charge?.payment_method_details?.card?.last4 ?? null;

        await supabaseAdmin.from("order_payments").upsert(
          {
            order_id: order.id,
            provider: "stripe",
            provider_payment_id: session.id,
            square_payment_id: session.id,
            status: "COMPLETED",
            amount_cents: totalCents,
            currency: "GBP",
            card_brand: cardBrand,
            last_4: last4,
            receipt_url: charge?.receipt_url ?? null,
            created_by: order.user_id,
          },
          { onConflict: "order_id" },
        );

        const paidAt = await markOrderPaid(order, pi?.id ?? session.id);
        await postNotice(order, "Stripe", pi?.id ?? session.id, paidAt, totalCents);
        repaired++;
        console.log(`[payment-reconcile] order ${order.id} confirmed paid via Stripe session ${session.id}`);
      }
    } catch (e) {
      console.error("[payment-reconcile] failed for order", order.id, e);
    }
  }

  return { scanned: orders?.length ?? 0, repaired, stripeChecked };
}
