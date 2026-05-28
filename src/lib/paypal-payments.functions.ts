import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const baseUrl = () =>
  (process.env.PAYPAL_ENVIRONMENT ?? "live").toLowerCase() === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

async function getPaypalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal credentials not configured");
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PayPal auth ${res.status}: ${body?.error_description || res.statusText}`);
  if (!body?.access_token) throw new Error("PayPal did not return an access token");
  return body.access_token as string;
}

async function ppFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = body?.details?.[0]?.description || body?.message || res.statusText;
    throw new Error(`PayPal API ${res.status}: ${msg}`);
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

/** Returns the public PayPal client ID + environment so the browser can boot the JS SDK. */
export const getPaypalWebConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    if (!clientId) throw new Error("PAYPAL_CLIENT_ID not configured");
    const env = (process.env.PAYPAL_ENVIRONMENT ?? "live").toLowerCase() === "sandbox"
      ? "sandbox" : "live";
    return { clientId, environment: env as "sandbox" | "live", currency: "GBP" as const };
  });

/** Creates a PayPal order for the given internal order. Returns the PayPal order ID for SDK approval. */
export const createPaypalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
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

    const token = await getPaypalAccessToken();
    const value = (order.total_cents / 100).toFixed(2);
    const res = await ppFetch("/v2/checkout/orders", token, {
      method: "POST",
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: order.id,
          amount: { currency_code: "GBP", value },
          description: `Order #${String(order.id).slice(0, 8)}`,
        }],
      }),
    });

    if (!res?.id) throw new Error("PayPal did not return an order ID");
    return { paypalOrderId: res.id as string };
  });

/** Captures an approved PayPal order, verifies totals, persists, and marks the internal order paid. */
export const capturePaypalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    orderId: z.string().uuid(),
    paypalOrderId: z.string().min(4).max(64),
  }).parse(input))
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
    const totalCents = order.total_cents;
    const orderRowId = order.id as string;

    const token = await getPaypalAccessToken();
    const res = await ppFetch(`/v2/checkout/orders/${encodeURIComponent(data.paypalOrderId)}/capture`, token, {
      method: "POST",
      body: "{}",
    });

    const status: string = res?.status;
    if (status !== "COMPLETED") throw new Error(`PayPal status: ${status}`);

    const pu = res?.purchase_units?.[0];
    if (pu?.reference_id && pu.reference_id !== orderRowId) {
      throw new Error("PayPal reference mismatch");
    }
    const capture = pu?.payments?.captures?.[0];
    const capturedAmount = capture?.amount?.value;
    const expected = (totalCents / 100).toFixed(2);
    if (capturedAmount !== expected) {
      throw new Error(`PayPal amount mismatch (expected ${expected}, got ${capturedAmount})`);
    }
    const payerEmail: string | undefined = res?.payer?.email_address ?? undefined;
    const payerName: string | undefined = [res?.payer?.name?.given_name, res?.payer?.name?.surname]
      .filter(Boolean).join(" ").trim() || undefined;

    const { error: upErr } = await supabase
      .from("order_payments")
      .upsert({
        order_id: orderRowId,
        provider: "paypal",
        provider_payment_id: capture?.id ?? data.paypalOrderId,
        square_payment_id: capture?.id ?? data.paypalOrderId, // legacy NOT NULL compatibility
        status,
        amount_cents: totalCents,
        currency: "GBP",
        card_brand: "PayPal",
        last_4: payerEmail ? payerEmail.slice(0, 24) : null,
        receipt_url: null,
        created_by: userId,
      }, { onConflict: "order_id" });
    if (upErr) throw new Error(upErr.message);

    // Use the same RPC as the Square flow so the order transitions
    // pending → processing, paid_at/paid_by are stamped, and the standard
    // "💳 Payment received" system message is posted. This keeps the admin
    // order panel (Setting Up Account / Sale Complete buttons, status badge,
    // chat history) identical regardless of which provider captured payment.
    const { error: paidErr } = await supabase.rpc(
      "mark_order_paid" as never,
      { p_order_id: orderRowId } as never,
    );
    if (paidErr) {
      // Non-admin customers can't call this RPC — fall back to a direct
      // update of paid_at/paid_by so the order is still marked paid.
      const { error: fallbackErr } = await supabase
        .from("orders")
        .update({ paid_at: new Date().toISOString(), paid_by: userId })
        .eq("id", orderRowId);
      if (fallbackErr) console.error("Failed to mark order paid:", fallbackErr.message);
    }

    const who = payerName || payerEmail || "PayPal";
    await supabase.from("order_messages").insert({
      order_id: orderRowId,
      sender_id: userId,
      content: `✅ PayPal payment captured (${who}).`,
    });

    // Mirror payment confirmation into any linked support ticket(s)
    try {
      const { data: linkedTickets } = await supabase
        .from("tickets")
        .select("id")
        .eq("order_id", orderRowId);
      if (linkedTickets && linkedTickets.length > 0) {
        const txRef = capture?.id ?? data.paypalOrderId;
        const content =
          `✅ PayPal payment captured for order #${orderRowId.slice(0, 8)} (${who}).` +
          (txRef ? `\nTransaction ref: ${txRef}` : "");
        await supabase.from("ticket_messages").insert(
          linkedTickets.map((t: { id: string }) => ({
            ticket_id: t.id,
            sender_id: userId,
            content,
          })),
        );
      }
    } catch (e) {
      console.error("Failed to post PayPal payment message to ticket:", e);
    }

    return { status, paypalOrderId: data.paypalOrderId, captureId: capture?.id ?? null, payerEmail, payerName };
  });