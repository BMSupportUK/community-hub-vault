import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

    // Reuse an existing active invoice for this order instead of creating a
    // second one. Prevents accidental duplicate NOWPayments invoices when the
    // user double-clicks "Pay with USDT" or re-opens the order.
    const orderIdStr = String(order.id);
    const { data: existingPay } = await supabase
      .from("order_payments")
      .select("provider,status,provider_payment_id,receipt_url")
      .eq("order_id", orderIdStr)
      .maybeSingle();
    const reusableStatuses = new Set([
      "invoice_created",
      "waiting",
      "confirming",
      "partially_paid",
    ]);
    if (
      existingPay?.provider === "nowpayments" &&
      reusableStatuses.has(String(existingPay.status ?? "")) &&
      existingPay.receipt_url &&
      existingPay.provider_payment_id
    ) {
      return {
        invoiceId: String(existingPay.provider_payment_id),
        invoiceUrl: String(existingPay.receipt_url),
        network: data.network,
        payCurrency: NETWORK_TO_CODE[data.network],
        expiresAt: null,
        reused: true,
      };
    }

    const payCurrency = NETWORK_TO_CODE[data.network];
    const priceAmount = +(order.total_cents / 100).toFixed(2);

    // ipn_callback_url uses the project's stable preview URL when not in production
    const ipnUrl = process.env.NOWPAYMENTS_IPN_URL
      || "https://bmsupport.uk/api/public/hooks/nowpayments";

    // Extend payment window. NOWPayments default is 20 min; raise to 60 min
    // (configurable via NOWPAYMENTS_EXPIRY_MINUTES, capped 20–1440).
    const minutes = Math.max(
      20,
      Math.min(1440, Number(process.env.NOWPAYMENTS_EXPIRY_MINUTES) || 1440),
    );
    const expirationEstimateDate = new Date(Date.now() + minutes * 60 * 1000)
      .toISOString();

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
        expiration_estimate_date: expirationEstimateDate,
      }),
    });

    if (!invoice?.id || !invoice?.invoice_url) {
      throw new Error("NOWPayments did not return an invoice");
    }

    // Track invoice creation locally so admins can see which orders have a
    // crypto invoice outstanding, even before any IPN arrives. Only upsert if
    // there is no existing finished/confirming row (don't downgrade status).
    try {
      const finalStatuses = new Set(["finished", "confirming", "partially_paid"]);
      if (!existingPay || !finalStatuses.has(String(existingPay.status ?? ""))) {
        await supabase.from("order_payments").upsert(
          {
            order_id: orderIdStr,
            provider: "nowpayments",
            provider_payment_id: String(invoice.id),
            square_payment_id: String(invoice.id),
            status: "invoice_created",
            amount_cents: order.total_cents ?? 0,
            currency: "GBP",
            card_brand: `USDT-${data.network}`,
            last_4: null,
            receipt_url: String(invoice.invoice_url),
          },
          { onConflict: "order_id" },
        );
      }
    } catch (e) {
      console.warn("[nowpayments] failed to track invoice creation", e);
    }

    return {
      invoiceId: String(invoice.id),
      invoiceUrl: String(invoice.invoice_url),
      network: data.network,
      payCurrency,
      expiresAt: expirationEstimateDate,
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
      .select("paid_at,total_cents,user_id")
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

    // Actively query NOWPayments API to confirm status — don't rely solely on
    // the IPN webhook, which can be delayed or missed. If we find a finished
    // payment, upsert the latest status and mark the order paid here.
    try {
      if (!process.env.NOWPAYMENTS_API_KEY) {
        return { paid: false, status: pay?.status ?? "waiting" };
      }
      const list = await npFetch(
        `/payment/?limit=20&order_id=${encodeURIComponent(data.orderId)}`,
      );
      const payments: any[] = Array.isArray(list?.data) ? list.data : [];
      const priority = (s: string) =>
        ({ finished: 5, confirming: 4, partially_paid: 3, waiting: 2, failed: 1, expired: 1, refunded: 1 } as any)[s] ?? 0;
      payments.sort((a, b) => priority(b.payment_status) - priority(a.payment_status));
      const best = payments[0];
      if (best) {
        const status: string = String(best.payment_status ?? "waiting");
        const payCurrency = String(best.pay_currency ?? "").toUpperCase();
        const networkLabel = payCurrency.startsWith("USDT")
          ? `USDT-${payCurrency.replace(/^USDT/, "") || "ERC20"}`
          : payCurrency || "USDT";
        const txHash: string | undefined = best.payin_hash || best.outcome?.hash;

        await supabaseAdmin
          .from("order_payments")
          .upsert(
            {
              order_id: data.orderId,
              provider: "nowpayments",
              provider_payment_id: String(best.payment_id ?? best.invoice_id ?? ""),
              square_payment_id: String(best.payment_id ?? best.invoice_id ?? "nowpayments"),
              status,
              amount_cents: order?.total_cents ?? 0,
              currency: "GBP",
              card_brand: networkLabel,
              last_4: txHash ? txHash.slice(-8) : null,
              receipt_url: null,
            },
            { onConflict: "order_id" },
          );

        if (status === "finished" && !order?.paid_at) {
          const actuallyPaid = Number(best.actually_paid ?? 0);
          const priceAmount = Number(best.price_amount ?? 0);
          if (!(priceAmount > 0 && actuallyPaid > 0 && actuallyPaid < priceAmount * 0.99)) {
            const { error: paidErr } = await supabaseAdmin.rpc(
              "mark_order_paid" as never,
              { p_order_id: data.orderId } as never,
            );
            if (paidErr) {
              await supabaseAdmin
                .from("orders")
                .update({ paid_at: new Date().toISOString() })
                .eq("id", data.orderId);
            }
            if (order?.user_id) {
              await supabaseAdmin.from("order_messages").insert({
                order_id: data.orderId,
                sender_id: order.user_id,
                content: `✅ USDT payment received (${networkLabel}${txHash ? `, tx ${txHash.slice(0, 10)}…` : ""}).`,
              });
            }
            return { paid: true, status: "paid" as const };
          }
        }
        return { paid: false, status };
      }
    } catch (e) {
      console.warn("[nowpayments] active status check failed", e);
    }

    return { paid: false, status: pay?.status ?? "waiting" };
  });