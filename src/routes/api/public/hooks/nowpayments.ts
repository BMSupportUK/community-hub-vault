import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * NOWPayments IPN signature: HMAC-SHA512 of the payload re-serialized with
 * alphabetically-sorted keys (recursively), using the store's IPN secret.
 * See https://nowpayments.io/help/payment-callbacks
 */
function sortedStringify(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(sortedStringify).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + sortedStringify(value[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

export const Route = createFileRoute("/api/public/hooks/nowpayments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.NOWPAYMENTS_IPN_SECRET;
        if (!secret) return new Response("IPN secret not configured", { status: 500 });

        const sig = request.headers.get("x-nowpayments-sig");
        const body = await request.text();
        if (!sig) return new Response("Missing signature", { status: 401 });

        let payload: any;
        try { payload = JSON.parse(body); } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const expected = createHmac("sha512", secret)
          .update(sortedStringify(payload))
          .digest("hex");

        try {
          if (
            sig.length !== expected.length ||
            !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
          ) {
            return new Response("Invalid signature", { status: 401 });
          }
        } catch {
          return new Response("Invalid signature", { status: 401 });
        }

        const orderId: string | undefined = payload?.order_id;
        const status: string | undefined = payload?.payment_status;
        const paymentId = String(payload?.payment_id ?? payload?.invoice_id ?? "");
        const payCurrency: string = String(payload?.pay_currency ?? "").toUpperCase();
        const actuallyPaid = Number(payload?.actually_paid ?? 0);
        const priceAmount = Number(payload?.price_amount ?? 0);
        const txHash: string | undefined = payload?.payin_hash || payload?.outcome?.hash;

        if (!orderId || !status) return new Response("ok");

        // Fetch order to validate amount
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id,total_cents,paid_at,user_id")
          .eq("id", orderId)
          .maybeSingle();
        if (!order) return new Response("ok");

        const networkLabel = payCurrency.startsWith("USDT")
          ? `USDT-${payCurrency.replace(/^USDT/, "") || "TRC20"}`
          : payCurrency || "USDT";

        // Always upsert latest status (waiting/confirming/finished/failed/expired/refunded)
        await supabaseAdmin
          .from("order_payments")
          .upsert(
            {
              order_id: orderId,
              provider: "nowpayments",
              provider_payment_id: paymentId || null,
              square_payment_id: paymentId || "nowpayments", // legacy NOT NULL compatibility
              status,
              amount_cents: order.total_cents ?? 0,
              currency: "GBP",
              card_brand: networkLabel,
              last_4: txHash ? txHash.slice(-8) : null,
              receipt_url: null,
            },
            { onConflict: "order_id" },
          );

        // Only mark order paid on success and only if not already paid
        if (status === "finished" && !order.paid_at) {
          // Underpayment guard: only mark paid if customer paid at least the price
          if (priceAmount > 0 && actuallyPaid > 0 && actuallyPaid < priceAmount * 0.99) {
            console.warn(`[nowpayments] underpayment on order ${orderId}: ${actuallyPaid}/${priceAmount}`);
            return new Response("ok");
          }

          const { error: paidErr } = await supabaseAdmin.rpc(
            "mark_order_paid" as never,
            { p_order_id: orderId } as never,
          );
          if (paidErr) {
            await supabaseAdmin
              .from("orders")
              .update({ paid_at: new Date().toISOString() })
              .eq("id", orderId);
          }

          await supabaseAdmin.from("order_messages").insert({
            order_id: orderId,
            sender_id: order.user_id,
            content: `✅ USDT payment received (${networkLabel}${txHash ? `, tx ${txHash.slice(0, 10)}…` : ""}).`,
          });
        }

        return new Response("ok");
      },
    },
  },
});