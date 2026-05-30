import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

    // Track the PayPal order ID immediately so reconcilePaypalOrder can
    // auto-capture later if the buyer approves but the browser never
    // completes the capture call (closed tab, network drop, etc.). Don't
    // downgrade an already-completed payment row.
    try {
      const { data: existingPay } = await supabaseAdmin
        .from("order_payments")
        .select("status")
        .eq("order_id", order.id)
        .maybeSingle();
      const finalStatuses = new Set(["COMPLETED", "completed"]);
      if (!existingPay || !finalStatuses.has(String(existingPay.status ?? ""))) {
        await supabaseAdmin.from("order_payments").upsert(
          {
            order_id: order.id,
            provider: "paypal",
            provider_payment_id: String(res.id),
            square_payment_id: String(res.id),
            status: "CREATED",
            amount_cents: order.total_cents ?? 0,
            currency: "GBP",
            card_brand: "PayPal",
            last_4: null,
            receipt_url: null,
          },
          { onConflict: "order_id" },
        );
      }
    } catch (e) {
      console.warn("[paypal] failed to track created order", e);
    }

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

/**
 * Actively asks PayPal for the latest status of a previously-created order
 * and auto-captures it if the buyer approved but never completed capture.
 * Safe to call repeatedly — no-ops once the internal order is marked paid.
 */
export const reconcilePaypalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrOrderOwner(supabase, userId, data.orderId);

    const { data: order } = await supabase
      .from("orders")
      .select("id,total_cents,paid_at,user_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { paid: false, status: "not_found" as const };
    if (order.paid_at) return { paid: true, status: "paid" as const };

    const { data: pay } = await supabaseAdmin
      .from("order_payments")
      .select("provider,status,provider_payment_id")
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (!pay || pay.provider !== "paypal" || !pay.provider_payment_id) {
      return { paid: false, status: pay?.status ?? "no_paypal_order" };
    }

    let token: string;
    try { token = await getPaypalAccessToken(); }
    catch (e) { console.warn("[paypal] reconcile auth failed", e); return { paid: false, status: pay.status }; }

    const paypalOrderId = String(pay.provider_payment_id);
    let res: any;
    try { res = await ppFetch(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, token); }
    catch (e) { console.warn("[paypal] reconcile lookup failed", e); return { paid: false, status: pay.status }; }

    let status: string = res?.status ?? "UNKNOWN";

    // If buyer approved but capture never ran, capture now.
    if (status === "APPROVED") {
      try {
        res = await ppFetch(
          `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
          token,
          { method: "POST", body: "{}" },
        );
        status = res?.status ?? status;
      } catch (e) {
        console.warn("[paypal] reconcile capture failed", e);
        return { paid: false, status };
      }
    }

    if (status !== "COMPLETED") {
      await supabaseAdmin
        .from("order_payments")
        .update({ status })
        .eq("order_id", data.orderId);
      return { paid: false, status };
    }

    // Validate captured amount, then mark paid via the same RPC path.
    const pu = res?.purchase_units?.[0];
    const capture = pu?.payments?.captures?.[0];
    const capturedAmount = capture?.amount?.value;
    const expected = ((order.total_cents ?? 0) / 100).toFixed(2);
    if (capturedAmount && capturedAmount !== expected) {
      console.warn(`[paypal] reconcile amount mismatch: ${capturedAmount} vs ${expected}`);
      return { paid: false, status: "amount_mismatch" };
    }
    const payerEmail: string | undefined = res?.payer?.email_address ?? undefined;
    const payerName: string | undefined = [res?.payer?.name?.given_name, res?.payer?.name?.surname]
      .filter(Boolean).join(" ").trim() || undefined;

    await supabaseAdmin.from("order_payments").upsert(
      {
        order_id: data.orderId,
        provider: "paypal",
        provider_payment_id: capture?.id ?? paypalOrderId,
        square_payment_id: capture?.id ?? paypalOrderId,
        status,
        amount_cents: order.total_cents ?? 0,
        currency: "GBP",
        card_brand: "PayPal",
        last_4: payerEmail ? payerEmail.slice(0, 24) : null,
        receipt_url: null,
      },
      { onConflict: "order_id" },
    );

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

    if (order.user_id) {
      const who = payerName || payerEmail || "PayPal";
      await supabaseAdmin.from("order_messages").insert({
        order_id: data.orderId,
        sender_id: order.user_id,
        content: `✅ PayPal payment captured (${who}).`,
      });
    }

    return { paid: true, status: "paid" as const };
  });