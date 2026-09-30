import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { unlock } from "@/lib/checkout.functions";

/**
 * Inline card payments for the secure checkout page. Gated by the order's
 * unguessable token + password, so it works for signed-out customers too.
 */
const creds = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(1).max(64),
});

const sqBase = () =>
  (process.env.SQUARE_ENVIRONMENT ?? "production").toLowerCase() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

async function loadOrder(supabaseAdmin: any, orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,user_id,order_ref,total_cents,paid_at,status,manual_pay_method")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("Order not found");
  if (order.paid_at) throw new Error("This order is already paid");
  if (String(order.status) === "cancelled") throw new Error("This order was cancelled");
  if (!order.total_cents || order.total_cents <= 0) throw new Error("Order total must be greater than zero");
  return order;
}

async function markPaid(supabaseAdmin: any, order: any, provider: "Square" | "Stripe" | "NOWPayments", reference: string, receiptUrl?: string | null) {
  await supabaseAdmin.from("orders").update({ paid_at: new Date().toISOString() }).eq("id", order.id).is("paid_at", null);
  try {
    const { postOrderPaymentReceivedNotice } = await import("@/lib/order-payment-notice.server");
    await postOrderPaymentReceivedNotice({ orderId: order.id, provider, reference, receiptUrl: receiptUrl ?? null } as any);
  } catch { /* best effort */ }
}

export const checkoutSquareConfig = createServerFn({ method: "POST" })
  .inputValidator((d) => creds.parse(d))
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) throw new Error("Not authorized");
    const appId = process.env.SQUARE_APPLICATION_ID;
    const locationId = process.env.SQUARE_LOCATION_ID;
    if (!appId || !locationId) throw new Error("Card payments are not configured");
    const env = (process.env.SQUARE_ENVIRONMENT ?? "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
    return { applicationId: appId, locationId, environment: env as "sandbox" | "production" };
  });

export const checkoutSquareCharge = createServerFn({ method: "POST" })
  .inputValidator((d) => creds.extend({ sourceId: z.string().min(4).max(512) }).parse(d))
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) throw new Error("Not authorized");
    const { supabaseAdmin, link } = u;
    const order = await loadOrder(supabaseAdmin, link.order_id);
    const token = process.env.SQUARE_ACCESS_TOKEN;
    const locationId = process.env.SQUARE_LOCATION_ID;
    if (!token || !locationId) throw new Error("Card payments are not configured");
    const res = await fetch(`${sqBase()}/v2/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Square-Version": "2024-10-17" },
      body: JSON.stringify({
        source_id: data.sourceId,
        idempotency_key: `c${String(order.id).replace(/-/g, "").slice(0, 24)}${Date.now().toString(36)}`,
        amount_money: { amount: order.total_cents, currency: "GBP" },
        location_id: locationId,
        reference_id: order.id,
        note: `Order ${order.order_ref ?? String(order.id).slice(0, 8)}`,
        autocomplete: true,
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.errors?.[0]?.detail || "Card payment failed");
    const payment = body?.payment;
    if (!payment?.id || !["COMPLETED", "APPROVED"].includes(String(payment.status))) {
      throw new Error(`Card payment status: ${payment?.status ?? "unknown"}`);
    }
    const cardBrand = payment?.card_details?.card?.card_brand ?? null;
    const last4 = payment?.card_details?.card?.last_4 ?? null;
    const receiptUrl = payment?.receipt_url ?? null;
    await supabaseAdmin.from("order_payments").upsert({
      order_id: order.id, provider: "square", provider_payment_id: payment.id, square_payment_id: payment.id,
      status: payment.status, amount_cents: order.total_cents, currency: "GBP",
      card_brand: cardBrand, last_4: last4, receipt_url: receiptUrl, created_by: order.user_id,
    }, { onConflict: "order_id" });
    await markPaid(supabaseAdmin, order, "Square", payment.id, receiptUrl);
    return { status: String(payment.status), cardBrand, last4, receiptUrl };
  });

export const checkoutStripeSession = createServerFn({ method: "POST" })
  .inputValidator((d) => creds.extend({ environment: z.enum(["sandbox", "live"]), returnUrl: z.string().url() }).parse(d))
  .handler(async ({ data }): Promise<{ clientSecret: string } | { error: string }> => {
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const u = await unlock(data.token, data.password);
      if (!u) throw new Error("Not authorized");
      const { supabaseAdmin, link } = u;
      const order = await loadOrder(supabaseAdmin, link.order_id);
      const stripe = createStripeClient(data.environment);
      const ref = order.order_ref ?? String(order.id).slice(0, 8);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        line_items: [{ price_data: { currency: "gbp", product_data: { name: `Order ${ref}` }, unit_amount: order.total_cents }, quantity: 1 }],
        payment_intent_data: { description: `Order ${ref}`, metadata: { order_id: String(order.id) } },
        metadata: { order_id: String(order.id), ...(order.user_id ? { user_id: String(order.user_id) } : {}) },
      } as any);
      if (!session.client_secret) throw new Error("Stripe did not return a client secret");
      await supabaseAdmin.from("order_payments").upsert({
        order_id: order.id, provider: "stripe", provider_payment_id: session.id, square_payment_id: session.id,
        status: "PENDING", amount_cents: order.total_cents, currency: "GBP", created_by: order.user_id,
      }, { onConflict: "order_id" });
      return { clientSecret: session.client_secret };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

/** Called by getCheckout: detect a completed inline Stripe session. */
export async function syncStripeSession(supabaseAdmin: any, orderId: string) {
  const { data: p } = await supabaseAdmin.from("order_payments").select("provider,provider_payment_id,status").eq("order_id", orderId).maybeSingle();
  if (!p || p.provider !== "stripe" || !p.provider_payment_id || String(p.provider_payment_id).startsWith("in_")) return;
  const { createStripeClient } = await import("@/lib/stripe.server");
  const primary = (process.env.STRIPE_ENVIRONMENT as "sandbox" | "live") ?? "sandbox";
  for (const env of primary === "live" ? (["live", "sandbox"] as const) : (["sandbox", "live"] as const)) {
    try {
      const s = await createStripeClient(env).checkout.sessions.retrieve(String(p.provider_payment_id));
      if (s.payment_status === "paid") {
        const { data: order } = await supabaseAdmin.from("orders").select("id,total_cents,paid_at").eq("id", orderId).maybeSingle();
        if (order && !order.paid_at && Number(s.amount_total) === Number(order.total_cents)) {
          await supabaseAdmin.from("order_payments").update({ status: "COMPLETED" }).eq("order_id", orderId);
          await markPaid(supabaseAdmin, order, "Stripe", String(s.payment_intent ?? s.id));
        }
      }
      return;
    } catch { /* try other environment */ }
  }
}

async function npFetch(path: string, init: RequestInit = {}) {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error("Crypto payments are not configured");
  const res = await fetch(`https://api.nowpayments.io/v1${path}`, {
    ...init,
    headers: { "x-api-key": key, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || "NOWPayments request failed");
  return body;
}

/** Create (or reuse) a NOWPayments USDT invoice for the secure checkout page. */
export const checkoutCryptoInvoice = createServerFn({ method: "POST" })
  .inputValidator((d) => creds.parse(d))
  .handler(async ({ data }): Promise<{ invoiceUrl: string } | { error: string }> => {
    try {
      const u = await unlock(data.token, data.password);
      if (!u) throw new Error("Not authorized");
      const { supabaseAdmin, link } = u;
      const order = await loadOrder(supabaseAdmin, link.order_id);
      const { data: existing } = await supabaseAdmin.from("order_payments").select("provider,status,receipt_url").eq("order_id", order.id).maybeSingle();
      if (existing?.provider === "nowpayments" && existing.receipt_url && ["invoice_created", "waiting", "confirming", "partially_paid"].includes(String(existing.status))) {
        return { invoiceUrl: String(existing.receipt_url) };
      }
      const minutes = Math.max(20, Math.min(1440, Number(process.env.NOWPAYMENTS_EXPIRY_MINUTES) || 1440));
      const invoice = await npFetch("/invoice", {
        method: "POST",
        body: JSON.stringify({
          price_amount: +(order.total_cents / 100).toFixed(2),
          price_currency: "gbp",
          pay_currency: "usdterc20",
          order_id: order.id,
          order_description: `Order ${order.order_ref ?? String(order.id).slice(0, 8)}`,
          ipn_callback_url: process.env.NOWPAYMENTS_IPN_URL || "https://bmsupport.uk/api/public/hooks/nowpayments",
          is_fee_paid_by_user: false,
          expiration_estimate_date: new Date(Date.now() + minutes * 60_000).toISOString(),
        }),
      });
      if (!invoice?.id || !invoice?.invoice_url) throw new Error("NOWPayments did not return an invoice");
      await supabaseAdmin.from("order_payments").upsert({
        order_id: order.id, provider: "nowpayments", provider_payment_id: String(invoice.id), square_payment_id: String(invoice.id),
        status: "invoice_created", amount_cents: order.total_cents, currency: "GBP", card_brand: "USDT-ERC20",
        receipt_url: String(invoice.invoice_url), created_by: order.user_id,
      }, { onConflict: "order_id" });
      return { invoiceUrl: String(invoice.invoice_url) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

/** Called by getCheckout: detect a finished NOWPayments payment. */
export async function syncCryptoPayment(supabaseAdmin: any, orderId: string) {
  if (!process.env.NOWPAYMENTS_API_KEY) return;
  const { data: p } = await supabaseAdmin.from("order_payments").select("provider").eq("order_id", orderId).maybeSingle();
  if (!p || p.provider !== "nowpayments") return;
  const list = await npFetch(`/payment/?limit=20&order_id=${encodeURIComponent(orderId)}`);
  const pays: any[] = Array.isArray(list?.data) ? list.data : [];
  const done = pays.find((x) => x.payment_status === "finished");
  const best = done ?? pays[0];
  if (!best) return;
  await supabaseAdmin.from("order_payments").update({ status: String(best.payment_status ?? "waiting") }).eq("order_id", orderId);
  if (done) {
    const paidAmt = Number(done.actually_paid ?? 0), price = Number(done.price_amount ?? 0);
    if (price > 0 && paidAmt > 0 && paidAmt < price * 0.99) return;
    const { data: order } = await supabaseAdmin.from("orders").select("id,paid_at").eq("id", orderId).maybeSingle();
    if (order && !order.paid_at) await markPaid(supabaseAdmin, order, "NOWPayments", String(done.payment_id ?? ""));
  }
}
