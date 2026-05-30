import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STRIPE_API = "https://api.stripe.com/v1";

function stripeKey() {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY not configured");
  return k;
}

function toForm(obj: Record<string, any>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      parts.push(toForm(v, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

async function stripeFetch(
  path: string,
  init: { method?: string; body?: Record<string, any>; idempotencyKey?: string } = {},
) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body ? toForm(init.body) : undefined,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = body?.error?.message || body?.error?.code || res.statusText;
    throw new Error(`Stripe API ${res.status}: ${msg}`);
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
  const { data: order } = await supabase
    .from("orders")
    .select("user_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.user_id !== userId) throw new Error("Not authorized");
}

const FINAL_PAYMENT_STATUSES = new Set(["COMPLETED", "completed", "finished"]);

async function getOrderPayment(orderId: string) {
  const { data } = await supabaseAdmin
    .from("order_payments")
    .select(
      "provider,provider_payment_id,status,amount_cents,currency,card_brand,last_4,receipt_url",
    )
    .eq("order_id", orderId)
    .maybeSingle();
  return data as any | null;
}

export const getStripeWebConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) throw new Error("STRIPE_PUBLISHABLE_KEY not configured");
    return { publishableKey };
  });

export const createStripePaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrOrderOwner(supabase, userId, data.orderId);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id,total_cents,paid_at")
      .eq("id", data.orderId)
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message || "Order not found");
    if (order.paid_at) throw new Error("Order is already paid");
    if (!order.total_cents || order.total_cents <= 0)
      throw new Error("Order total must be greater than zero");

    const existingPayment = await getOrderPayment(String(order.id));
    if (existingPayment) {
      if (FINAL_PAYMENT_STATUSES.has(String(existingPayment.status ?? ""))) {
        throw new Error("Order is already paid");
      }
      if (existingPayment.provider && existingPayment.provider !== "stripe") {
        throw new Error(`This order already has a ${existingPayment.provider} payment in progress`);
      }
      if (existingPayment.provider_payment_id) {
        const existingPi: any = await stripeFetch(
          `/payment_intents/${encodeURIComponent(existingPayment.provider_payment_id)}`,
        );
        if (existingPi?.status === "succeeded") {
          throw new Error("Payment has already completed. Refresh the order status.");
        }
        if (
          existingPi?.client_secret &&
          existingPi?.status !== "canceled" &&
          Number(existingPi?.amount) === Number(order.total_cents) &&
          String(existingPi?.currency).toLowerCase() === "gbp"
        ) {
          return {
            clientSecret: existingPi.client_secret as string,
            paymentIntentId: existingPi.id as string,
          };
        }
      }
    }

    // Lookup customer email + name for fraud detection (Stripe flags missing values)
    let customerEmail: string | undefined;
    let customerName: string | undefined;
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      customerEmail = authUser?.user?.email ?? undefined;
      const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, any>;
      customerName = meta.full_name || meta.name || meta.display_name || undefined;
    } catch {}
    if (!customerName) {
      try {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("display_name,full_name,username")
          .eq("id", userId)
          .maybeSingle();
        customerName =
          (profile as any)?.display_name ||
          (profile as any)?.full_name ||
          (profile as any)?.username ||
          undefined;
      } catch {}
    }

    const pi = await stripeFetch("/payment_intents", {
      method: "POST",
      idempotencyKey: `order-${String(order.id)}-${Number(order.total_cents)}`,
      body: {
        amount: order.total_cents,
        currency: "gbp",
        "payment_method_types[]": "card",
        metadata: {
          order_id: String(order.id),
          user_id: userId,
          ...(customerName ? { customer_name: customerName } : {}),
        },
        description: `Order #${String(order.id).slice(0, 8)}`,
        ...(customerEmail ? { receipt_email: customerEmail } : {}),
      },
    });
    if (!pi?.client_secret) throw new Error("Stripe did not return a client_secret");
    const { error: paymentTrackErr } = await supabaseAdmin.from("order_payments").upsert(
      {
        order_id: String(order.id),
        provider: "stripe",
        provider_payment_id: pi.id,
        square_payment_id: pi.id,
        status: "PENDING",
        amount_cents: order.total_cents,
        currency: "GBP",
        created_by: userId,
      },
      { onConflict: "order_id" },
    );
    if (paymentTrackErr) throw new Error(paymentTrackErr.message);
    return { clientSecret: pi.client_secret as string, paymentIntentId: pi.id as string };
  });

export const confirmStripePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        paymentIntentId: z.string().min(4).max(256),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrOrderOwner(supabase, userId, data.orderId);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id,total_cents,paid_at")
      .eq("id", data.orderId)
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message || "Order not found");
    if (order.paid_at) return { status: "already_paid" as const };
    const totalCents = order.total_cents ?? 0;
    if (totalCents <= 0) throw new Error("Order total must be greater than zero");

    const existingPayment = await getOrderPayment(String(order.id));
    if (existingPayment) {
      if (FINAL_PAYMENT_STATUSES.has(String(existingPayment.status ?? ""))) {
        if (existingPayment.provider_payment_id !== data.paymentIntentId) {
          throw new Error("Payment is already recorded for this order. Refresh the order status.");
        }
      }
      if (existingPayment.provider && existingPayment.provider !== "stripe") {
        throw new Error(`This order already has a ${existingPayment.provider} payment in progress`);
      }
      if (
        existingPayment.provider_payment_id &&
        existingPayment.provider_payment_id !== data.paymentIntentId
      ) {
        throw new Error(
          "A different card payment is already in progress for this order. Refresh and try again.",
        );
      }
    }

    const pi: any = await stripeFetch(
      `/payment_intents/${encodeURIComponent(data.paymentIntentId)}`,
    );
    if (pi?.status !== "succeeded")
      throw new Error(`Stripe payment status: ${pi?.status ?? "unknown"}`);
    if (Number(pi?.amount) !== totalCents) throw new Error("Stripe amount mismatch");
    if (pi?.metadata?.order_id && pi.metadata.order_id !== String(order.id)) {
      throw new Error("Stripe order metadata mismatch");
    }

    // Find latest charge for receipt/card details
    let cardBrand: string | undefined;
    let last4: string | undefined;
    let receiptUrl: string | undefined;
    try {
      const charges = await stripeFetch(
        `/charges?payment_intent=${encodeURIComponent(pi.id)}&limit=1`,
      );
      const ch = charges?.data?.[0];
      cardBrand = ch?.payment_method_details?.card?.brand ?? undefined;
      last4 = ch?.payment_method_details?.card?.last4 ?? undefined;
      receiptUrl = ch?.receipt_url ?? undefined;
    } catch {}

    const { error: upErr } = await supabaseAdmin.from("order_payments").upsert(
      {
        order_id: String(order.id),
        provider: "stripe",
        provider_payment_id: pi.id,
        square_payment_id: pi.id,
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
    if (upErr) throw new Error(upErr.message);

    const { error: paidErr } = await supabaseAdmin.rpc(
      "mark_order_paid" as never,
      {
        p_order_id: String(order.id),
        p_transaction_id: pi.id,
      } as never,
    );
    if (paidErr) {
      const { error: fallbackPaidErr } = await supabaseAdmin
        .from("orders")
        .update({ paid_at: new Date().toISOString(), paid_by: userId })
        .eq("id", String(order.id));
      if (fallbackPaidErr) throw new Error(fallbackPaidErr.message);
    }

    try {
      await supabaseAdmin.from("order_messages").insert({
        order_id: String(order.id),
        sender_id: userId,
        content: `✅ Card payment captured via Stripe${cardBrand && last4 ? ` (${cardBrand} •••• ${last4})` : ""}.`,
      });
    } catch (e) {
      console.error("Failed to post Stripe payment message to order:", e);
    }

    try {
      const { data: linkedTickets } = await supabaseAdmin
        .from("tickets")
        .select("id,user_id")
        .eq("order_id", String(order.id));
      if (linkedTickets && linkedTickets.length > 0) {
        const content =
          `✅ Card payment captured via Stripe for order #${String(order.id).slice(0, 8)}` +
          `${cardBrand && last4 ? ` (${cardBrand} •••• ${last4})` : ""}` +
          ` — £${(totalCents / 100).toFixed(2)}.` +
          `\nTransaction ref: ${pi.id}` +
          (receiptUrl ? `\nReceipt: ${receiptUrl}` : "");
        await supabaseAdmin.from("ticket_messages").insert(
          linkedTickets.map((t: { id: string }) => ({
            ticket_id: t.id,
            sender_id: userId,
            content,
          })),
        );
      }
    } catch (e) {
      console.error("Failed to post Stripe payment message to ticket:", e);
    }

    return {
      status: "COMPLETED" as const,
      paymentId: pi.id as string,
      cardBrand,
      last4,
      receiptUrl,
    };
  });
