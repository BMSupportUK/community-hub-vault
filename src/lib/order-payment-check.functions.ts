import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isSettledPaymentStatus } from "@/lib/payment-status";
import { type StripeEnv, createStripeClient } from "@/lib/stripe.server";

/**
 * Single "I've paid" check that interrogates BOTH providers the customer can
 * choose from (Stripe and Square) plus the locally stored payment row, and
 * marks the order paid when any of them reports a completed payment.
 *
 * Returned `status` values:
 *   paid | already_paid | pending  — never throws for "nothing found".
 */

type CheckResult = {
  paid: boolean;
  status: "paid" | "already_paid" | "pending";
  provider: string | null;
  reference: string | null;
  detail: string;
  checked: string[];
};

const SQ_VERSION = "2024-10-17";

function squareBaseUrl() {
  return (process.env.SQUARE_ENVIRONMENT ?? "production").toLowerCase() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

async function sqFetch(path: string, init: RequestInit = {}) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN not configured");
  const res = await fetch(`${squareBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Square-Version": SQ_VERSION,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = body?.errors?.[0]?.detail || body?.errors?.[0]?.code || res.statusText;
    throw new Error(`Square API ${res.status}: ${msg}`);
  }
  return body;
}

async function assertAdminOrOrderOwner(supabase: any, userId: string, orderId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "management"]);
  if (roles && roles.length > 0) return;
  const { data: order } = await supabase.from("orders").select("user_id").eq("id", orderId).maybeSingle();
  if (!order || order.user_id !== userId) throw new Error("Not authorized");
}

async function markPaid(orderId: string, transactionId: string | null, actorId: string) {
  const { error } = await supabaseAdmin.rpc("mark_order_paid" as never, {
    p_order_id: orderId,
    p_transaction_id: transactionId ?? orderId,
  } as never);
  if (error) {
    await supabaseAdmin
      .from("orders")
      .update({ paid_at: new Date().toISOString(), paid_by: actorId })
      .eq("id", orderId);
  }
  return new Date().toISOString();
}

async function postNotice(args: {
  orderId: string;
  provider: string;
  reference: string | null;
  amountCents: number;
  actorId: string;
  receiptUrl?: string | null;
}) {
  try {
    const { postOrderPaymentReceivedNotice } = await import("@/lib/order-payment-notice.server");
    const notice = await postOrderPaymentReceivedNotice({
      orderId: args.orderId,
      provider: args.provider,
      amountCents: args.amountCents,
      reference: args.reference,
      receiptUrl: args.receiptUrl ?? null,
      actorId: args.actorId,
    });
    return notice?.ticketId ?? null;
  } catch (e) {
    console.error("[payment-check] notice failed", args.orderId, e);
    return null;
  }
}

export const checkOrderPaymentAcrossProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CheckResult> => {
    const { supabase, userId } = context;
    await assertAdminOrOrderOwner(supabase, userId, data.orderId);

    const orderId = data.orderId;
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,user_id,total_cents,paid_at,status")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) throw new Error("Order not found");

    const totalCents = Number(order.total_cents ?? 0);
    const checked: string[] = [];

    if (order.paid_at) {
      return {
        paid: true,
        status: "already_paid",
        provider: null,
        reference: null,
        detail: "This order is already marked as paid.",
        checked,
      };
    }

    // 0. Locally stored payment row already settled — repair the order.
    const { data: payment } = await supabaseAdmin
      .from("order_payments")
      .select("provider,provider_payment_id,status,amount_cents,receipt_url")
      .eq("order_id", orderId)
      .maybeSingle();

    if (payment && isSettledPaymentStatus(String(payment.status ?? ""))) {
      const ref = payment.provider_payment_id ? String(payment.provider_payment_id) : null;
      await markPaid(orderId, ref, userId);
      const providerLabel = payment.provider === "square" ? "Square" : payment.provider === "stripe" ? "Stripe" : String(payment.provider ?? "card");
      await postNotice({ orderId, provider: providerLabel, reference: ref, amountCents: totalCents, actorId: userId, receiptUrl: payment.receipt_url as string | null });
      return { paid: true, status: "paid", provider: providerLabel, reference: ref, detail: `Payment confirmed via ${providerLabel}.`, checked: ["stored"] };
    }

    // 1. Stripe — stored checkout session first, then a metadata search so a
    //    payment made from another device/session is still found.
    try {
      const stripe = createStripeClient((process.env.STRIPE_ENVIRONMENT as StripeEnv) ?? "sandbox");
      checked.push("Stripe");

      let stripeRef: string | null = null;
      let cardBrand: string | null = null;
      let last4: string | null = null;
      let receiptUrl: string | null = null;

      const storedSession = payment?.provider === "stripe" ? String(payment.provider_payment_id ?? "") : "";
      if (storedSession.startsWith("cs_")) {
        const session = await stripe.checkout.sessions.retrieve(storedSession, { expand: ["payment_intent"] });
        if (session.payment_status === "paid" && Number(session.amount_total) === totalCents) {
          const pi = session.payment_intent as any;
          stripeRef = pi?.id ?? session.id;
          const ch = pi?.charges?.data?.[0];
          cardBrand = ch?.payment_method_details?.card?.brand ?? null;
          last4 = ch?.payment_method_details?.card?.last4 ?? null;
          receiptUrl = ch?.receipt_url ?? null;
        }
      }

      if (!stripeRef) {
        const found = await stripe.paymentIntents.search({
          query: `metadata['order_id']:'${orderId}' AND status:'succeeded'`,
          limit: 5,
        });
        const pi = found.data.find((p) => Number(p.amount_received || p.amount) === totalCents);
        if (pi) {
          stripeRef = pi.id;
          const ch = (pi as any)?.charges?.data?.[0];
          cardBrand = ch?.payment_method_details?.card?.brand ?? null;
          last4 = ch?.payment_method_details?.card?.last4 ?? null;
          receiptUrl = ch?.receipt_url ?? null;
        }
      }

      if (stripeRef) {
        await supabaseAdmin.from("order_payments").upsert(
          {
            order_id: orderId,
            provider: "stripe",
            provider_payment_id: stripeRef,
            square_payment_id: stripeRef,
            status: "COMPLETED",
            amount_cents: totalCents,
            currency: "GBP",
            card_brand: cardBrand,
            last_4: last4,
            receipt_url: receiptUrl,
            created_by: userId,
          },
          { onConflict: "order_id" },
        );
        await markPaid(orderId, stripeRef, userId);
        await postNotice({ orderId, provider: "Stripe", reference: stripeRef, amountCents: totalCents, actorId: userId, receiptUrl });
        return { paid: true, status: "paid", provider: "Stripe", reference: stripeRef, detail: "Card payment confirmed via Stripe.", checked };
      }
    } catch (e) {
      console.error("[payment-check] stripe lookup failed", orderId, e);
    }

    // 2. Square — invoice status, then a payments search by order reference.
    try {
      checked.push("Square");
      const { data: inv } = await supabaseAdmin
        .from("order_invoices")
        .select("square_invoice_id,status,public_url,invoice_number")
        .eq("order_id", orderId)
        .maybeSingle();

      if (inv?.square_invoice_id) {
        const res = await sqFetch(`/v2/invoices/${encodeURIComponent(String(inv.square_invoice_id))}`);
        const invoice = res?.invoice;
        if (invoice) {
          await supabaseAdmin
            .from("order_invoices")
            .update({
              status: invoice.status ?? inv.status,
              public_url: invoice.public_url ?? inv.public_url,
              invoice_number: invoice.invoice_number ?? inv.invoice_number,
              last_synced_at: new Date().toISOString(),
            })
            .eq("order_id", orderId);

          if (String(invoice.status).toUpperCase() === "PAID") {
            const ref = invoice.invoice_number ?? String(inv.square_invoice_id);
            await markPaid(orderId, ref, userId);
            await postNotice({ orderId, provider: "Square", reference: ref, amountCents: totalCents, actorId: userId, receiptUrl: invoice.public_url ?? null });
            return { paid: true, status: "paid", provider: "Square", reference: ref, detail: "Payment confirmed via Square invoice.", checked };
          }
        }
      }

      // Direct Square card payments are tagged with the order id as reference_id.
      const begin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      let cursor: string | undefined;
      let match: any = null;
      for (let page = 0; page < 3 && !match; page++) {
        const qs = new URLSearchParams({
          begin_time: begin,
          sort_order: "DESC",
          limit: "100",
          ...(cursor ? { cursor } : {}),
        });
        const res: any = await sqFetch(`/v2/payments?${qs.toString()}`);
        const payments: any[] = Array.isArray(res?.payments) ? res.payments : [];
        match = payments.find(
          (p) => p.reference_id === orderId && (p.status === "COMPLETED" || p.status === "APPROVED"),
        );
        cursor = res?.cursor;
        if (!cursor) break;
      }

      if (match && Number(match?.amount_money?.amount ?? 0) === totalCents) {
        await supabaseAdmin.from("order_payments").upsert(
          {
            order_id: orderId,
            provider: "square",
            provider_payment_id: match.id,
            square_payment_id: match.id,
            status: match.status,
            amount_cents: totalCents,
            currency: match?.amount_money?.currency ?? "GBP",
            card_brand: match?.card_details?.card?.card_brand ?? null,
            last_4: match?.card_details?.card?.last_4 ?? null,
            receipt_url: match?.receipt_url ?? null,
            created_by: userId,
          },
          { onConflict: "order_id" },
        );
        await markPaid(orderId, match.id, userId);
        await postNotice({ orderId, provider: "Square", reference: match.id, amountCents: totalCents, actorId: userId, receiptUrl: match?.receipt_url ?? null });
        return { paid: true, status: "paid", provider: "Square", reference: match.id, detail: "Card payment confirmed via Square.", checked };
      }
    } catch (e) {
      console.error("[payment-check] square lookup failed", orderId, e);
    }

    return {
      paid: false,
      status: "pending",
      provider: null,
      reference: null,
      detail: `No completed payment found yet (checked ${checked.join(" and ") || "providers"}). If you've just paid, wait a moment and check again.`,
      checked,
    };
  });
