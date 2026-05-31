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

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "management"]);
  if (!data || data.length === 0) throw new Error("Not authorized");
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

export const createSquareInvoiceForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrOrderOwner(supabase, userId, data.orderId);

    const locationId = process.env.SQUARE_LOCATION_ID;
    if (!locationId) throw new Error("SQUARE_LOCATION_ID not configured");

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id,user_id,total_cents,shipping_name,email,paid_at,status")
      .eq("id", data.orderId)
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message || "Order not found");
    const orderId = order.id;
    if (!orderId) throw new Error("Order id missing");
    if (order.paid_at) throw new Error("Order is already paid");
    if (!order.email) throw new Error("Order has no email address");
    if (!order.total_cents || order.total_cents <= 0) throw new Error("Order total must be greater than zero");

    const currency = "GBP";
    const idemBase = `order-${orderId}-${Date.now()}`;

    // 1. Create or find Square customer
    let customerId: string | undefined;
    try {
      const search = await sqFetch("/v2/customers/search", {
        method: "POST",
        body: JSON.stringify({
          query: { filter: { email_address: { exact: order.email } } },
          limit: 1,
        }),
      });
      customerId = search?.customers?.[0]?.id;
    } catch { /* ignore */ }

    if (!customerId) {
      const [given, ...rest] = (order.shipping_name || "").split(" ");
      const created = await sqFetch("/v2/customers", {
        method: "POST",
        body: JSON.stringify({
          idempotency_key: `${idemBase}-cust`,
          given_name: given || "Customer",
          family_name: rest.join(" ") || undefined,
          email_address: order.email,
        }),
      });
      customerId = created?.customer?.id;
    }
    if (!customerId) throw new Error("Failed to resolve Square customer");

    // 2. Create Square order
    const sqOrder = await sqFetch("/v2/orders", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `${idemBase}-ord`,
        order: {
          location_id: locationId,
          customer_id: customerId,
          line_items: [{
            name: `Order #${orderId.slice(0, 8)}`,
            quantity: "1",
            base_price_money: { amount: order.total_cents, currency },
          }],
        },
      }),
    });
    const squareOrderId = sqOrder?.order?.id;
    if (!squareOrderId) throw new Error("Failed to create Square order");

    // 3. Create draft invoice
    const inv = await sqFetch("/v2/invoices", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `${idemBase}-inv`,
        invoice: {
          location_id: locationId,
          order_id: squareOrderId,
          primary_recipient: { customer_id: customerId },
          payment_requests: [{
            request_type: "BALANCE",
            due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          }],
          delivery_method: "SHARE_MANUALLY",
          accepted_payment_methods: { card: true, square_gift_card: false, bank_account: false, buy_now_pay_later: false },
          title: `Order #${orderId.slice(0, 8)}`,
        },
      }),
    });
    const draftId = inv?.invoice?.id;
    const version = inv?.invoice?.version ?? 0;
    if (!draftId) throw new Error("Failed to create Square invoice");

    // 4. Publish
    const pub = await sqFetch(`/v2/invoices/${draftId}/publish`, {
      method: "POST",
      body: JSON.stringify({ version, idempotency_key: `${idemBase}-pub` }),
    });
    const invoice = pub?.invoice ?? inv?.invoice;

    // 5. Save row
    const row = {
      order_id: orderId,
      square_invoice_id: invoice.id,
      square_order_id: squareOrderId,
      invoice_number: invoice.invoice_number ?? null,
      public_url: invoice.public_url ?? null,
      status: invoice.status ?? "UNPAID",
      amount_cents: order.total_cents,
      currency,
      created_by: userId,
      last_synced_at: new Date().toISOString(),
    };
    const { data: saved, error: upErr } = await supabase
      .from("order_invoices")
      .upsert(row, { onConflict: "order_id" })
      .select()
      .single();
    if (upErr) throw new Error(upErr.message);

    // 6. Post invoice link in order chat
    if (invoice.public_url) {
      await supabase.from("order_messages").insert({
        order_id: orderId,
        sender_id: userId,
        content: `💳 Pay your invoice here: ${invoice.public_url}`,
      });
    }

    return saved;
  });

export const refreshSquareInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrOrderOwner(supabase, userId, data.orderId);

    const { data: row } = await supabase
      .from("order_invoices")
      .select("*")
      .eq("order_id", data.orderId)
      .single();
    if (!row) throw new Error("No Square invoice for this order");

    const res = await sqFetch(`/v2/invoices/${row.square_invoice_id}`);
    const invoice = res?.invoice;
    if (!invoice) throw new Error("Square invoice not found");

    const { data: updated, error } = await supabase
      .from("order_invoices")
      .update({
        status: invoice.status ?? row.status,
        public_url: invoice.public_url ?? row.public_url,
        invoice_number: invoice.invoice_number ?? row.invoice_number,
        last_synced_at: new Date().toISOString(),
      })
      .eq("order_id", data.orderId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // If Square reports the invoice as PAID, mark the order paid too.
    if (invoice.status === "PAID") {
      const { data: order } = await supabase
        .from("orders")
        .select("id,paid_at")
        .eq("id", data.orderId)
        .maybeSingle();
      if (order && !order.paid_at) {
        await supabase
          .from("orders")
          .update({ paid_at: new Date().toISOString() })
          .eq("id", data.orderId);
      }
    }

    return updated;
  });

export const cancelSquareInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrOrderOwner(supabase, userId, data.orderId);

    const { data: row } = await supabase
      .from("order_invoices")
      .select("*")
      .eq("order_id", data.orderId)
      .single();
    if (!row) throw new Error("No Square invoice for this order");

    const cur = await sqFetch(`/v2/invoices/${row.square_invoice_id}`);
    const version = cur?.invoice?.version ?? 0;

    const cancelled = await sqFetch(`/v2/invoices/${row.square_invoice_id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ version }),
    });
    const invoice = cancelled?.invoice;

    const { data: updated, error } = await supabase
      .from("order_invoices")
      .update({
        status: invoice?.status ?? "CANCELED",
        last_synced_at: new Date().toISOString(),
      })
      .eq("order_id", data.orderId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });