import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NP_BASE = "https://api.nowpayments.io/v1";

/** USDT network → NOWPayments pay_currency code */
const NETWORK_TO_CODE: Record<string, string> = {
  ERC20: "usdterc20",
};

async function npFetch(path: string, init: RequestInit = {}) {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error("NOWPAYMENTS_API_KEY not configured");
  const res = await fetch(`${NP_BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": key,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = body?.message || body?.error || res.statusText;
    throw new Error(`NOWPayments ${res.status}: ${msg}`);
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

/** Whether crypto payments are configured server-side (used by client to hide the panel). */
export const getCryptoConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return {
      enabled: Boolean(process.env.NOWPAYMENTS_API_KEY),
      networks: Object.keys(NETWORK_TO_CODE),
    };
  });

/** Creates a NOWPayments invoice for the given internal order. Returns iframe URL + invoice id. */
export const createCryptoInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      orderId: z.string().uuid(),
      network: z.enum(["ERC20"]).default("ERC20"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrOrderOwner(supabase, userId, data.orderId);

    const { data: order, error } = await supabase
      .from("orders")
      .select("id,total_cents,paid_at,status")
      .eq("id", data.orderId)
      .single();
    if (error || !order) throw new Error(error?.message || "Order not found");
    if (order.paid_at) throw new Error("Order is already paid");
    if (!order.total_cents || order.total_cents <= 0) throw new Error("Order total must be greater than zero");

    const payCurrency = NETWORK_TO_CODE[data.network];
    const priceAmount = +(order.total_cents / 100).toFixed(2);

    // ipn_callback_url uses the project's stable preview URL when not in production
    const ipnUrl = process.env.NOWPAYMENTS_IPN_URL
      || "https://bmsupport.uk/api/public/hooks/nowpayments";

    const invoice = await npFetch("/invoice", {
      method: "POST",
      body: JSON.stringify({
        price_amount: priceAmount,
        price_currency: "gbp",
        pay_currency: payCurrency,
        order_id: order.id,
        order_description: `Order #${String(order.id).slice(0, 8)}`,
        ipn_callback_url: ipnUrl,
        is_fee_paid_by_user: false,
      }),
    });

    if (!invoice?.id || !invoice?.invoice_url) {
      throw new Error("NOWPayments did not return an invoice");
    }

    return {
      invoiceId: String(invoice.id),
      invoiceUrl: String(invoice.invoice_url),
      network: data.network,
      payCurrency,
    };
  });

/** Polls invoice/payment status for an order. Returns paid=true once finalized. */
export const getCryptoInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrOrderOwner(supabase, userId, data.orderId);

    const { data: order } = await supabase
      .from("orders")
      .select("paid_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (order?.paid_at) return { paid: true, status: "paid" as const };

    const { data: pay } = await supabase
      .from("order_payments")
      .select("provider,status")
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (pay?.provider === "nowpayments" && pay.status === "finished") {
      return { paid: true, status: "paid" as const };
    }
    return { paid: false, status: pay?.status ?? "waiting" };
  });