import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const baseUrl = () =>
  (process.env.SQUARE_ENVIRONMENT ?? "production").toLowerCase() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

const SQ_VERSION = "2024-10-17";

async function sqFetch(path: string, init: RequestInit = {}) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN not configured");
  const res = await fetch(`${baseUrl()}${path}`, {
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
  const { data: order } = await supabase
    .from("orders")
    .select("user_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.user_id !== userId) throw new Error("Not authorized");
}

/** Returns the public Square Application ID so the browser can boot the Web Payments SDK. */
export const getSquareWebConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const appId = process.env.SQUARE_APPLICATION_ID;
    if (!appId) throw new Error("SQUARE_APPLICATION_ID not configured");
    const locationId = process.env.SQUARE_LOCATION_ID;
    if (!locationId) throw new Error("SQUARE_LOCATION_ID not configured");
    const env = (process.env.SQUARE_ENVIRONMENT ?? "production").toLowerCase() === "sandbox"
      ? "sandbox" : "production";
    return { applicationId: appId, locationId, environment: env as "sandbox" | "production" };
  });

export const chargeOrderWithSquare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    orderId: z.string().uuid(),
    sourceId: z.string().min(4).max(512),
    verificationToken: z.string().max(2048).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrOrderOwner(supabase, userId, data.orderId);

    const locationId = process.env.SQUARE_LOCATION_ID;
    if (!locationId) throw new Error("SQUARE_LOCATION_ID not configured");

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id,user_id,total_cents,paid_at,status")
      .eq("id", data.orderId)
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message || "Order not found");
    const orderId = order.id;
    if (!orderId) throw new Error("Order id missing");
    if (order.paid_at) throw new Error("Order is already paid");
    if (!order.total_cents || order.total_cents <= 0) throw new Error("Order total must be greater than zero");

    const currency = "GBP";
    // Square caps idempotency_key at 45 chars. Use short order prefix + base36 timestamp.
    const idempotencyKey = `o${orderId.replace(/-/g, "").slice(0, 24)}${Date.now().toString(36)}`;

    const res = await sqFetch("/v2/payments", {
      method: "POST",
      body: JSON.stringify({
        source_id: data.sourceId,
        idempotency_key: idempotencyKey,
        amount_money: { amount: order.total_cents, currency },
        location_id: locationId,
        reference_id: orderId,
        note: `Order #${orderId.slice(0, 8)}`,
        autocomplete: true,
        ...(data.verificationToken ? { verification_token: data.verificationToken } : {}),
      }),
    });

    const payment = res?.payment;
    if (!payment?.id) throw new Error("Square did not return a payment");
    const status = payment.status as string;
    if (status !== "COMPLETED" && status !== "APPROVED") {
      throw new Error(`Square payment status: ${status}`);
    }

    const cardBrand: string | undefined = payment?.card_details?.card?.card_brand ?? undefined;
    const last4: string | undefined = payment?.card_details?.card?.last_4 ?? undefined;
    const receiptUrl: string | undefined = payment?.receipt_url ?? undefined;

    const { error: upErr } = await supabase
      .from("order_payments")
      .upsert({
        order_id: orderId,
        square_payment_id: payment.id,
        status,
        amount_cents: order.total_cents,
        currency,
        card_brand: cardBrand,
        last_4: last4,
        receipt_url: receiptUrl,
        created_by: userId,
      }, { onConflict: "order_id" });
    if (upErr) throw new Error(upErr.message);

    // Mark order paid via private RPC if available, else via service-role would be needed.
    // Try updating through the orders view (PG should route the update to the underlying table if a rule exists).
    const { error: paidErr } = await supabase
      .from("orders")
      .update({ paid_at: new Date().toISOString(), paid_by: userId })
      .eq("id", orderId);
    if (paidErr) {
      // Non-fatal: payment was captured. Surface so admin can investigate.
      console.error("Failed to set paid_at on order:", paidErr.message);
    }

    await supabase.from("order_messages").insert({
      order_id: orderId,
      sender_id: userId,
      content: `✅ Card payment captured${cardBrand && last4 ? ` (${cardBrand} •••• ${last4})` : ""}.`,
    });

    return {
      status,
      receiptUrl,
      cardBrand,
      last4,
      paymentId: payment.id,
    };
  });