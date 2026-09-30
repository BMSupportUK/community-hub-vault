import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, timingSafeEqual } from "crypto";

/**
 * Public secure checkout page for manual orders. Every call is gated by the
 * order's unguessable token AND its unique password — no sign-in needed.
 * Only safe order fields are returned (no email, no internal notes).
 */

const creds = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(1).max(64),
});

function same(a: string, b: string) {
  const x = createHash("sha256").update(a.trim().toUpperCase()).digest();
  const y = createHash("sha256").update(b.trim().toUpperCase()).digest();
  return timingSafeEqual(x, y);
}

async function unlock(token: string, password: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: link } = await supabaseAdmin
    .from("order_checkout_links")
    .select("order_id,password,customer_kind")
    .eq("token", token)
    .maybeSingle();
  // Always run a comparison so a wrong token and a wrong password look the same.
  const ok = same(password, link?.password ?? "____-____-____") && !!link;
  if (!ok || !link) return null;
  return { supabaseAdmin, link };
}

async function syncInvoice(supabaseAdmin: any, orderId: string, method: string) {
  const { data: inv } = await supabaseAdmin.from("order_invoices").select("*").eq("order_id", orderId).maybeSingle();
  if (!inv) return null;
  const settled = ["paid", "PAID"].includes(String(inv.status));
  const stale = !inv.last_synced_at || Date.now() - new Date(inv.last_synced_at).getTime() > 15_000;
  if (!settled && stale) {
    try {
      let paid = false;
      let reference: string | null = inv.invoice_number ?? null;
      if (method === "stripe" && inv.stripe_invoice_id) {
        const { createStripeClient } = await import("@/lib/stripe.server");
        const primary = (process.env.STRIPE_ENVIRONMENT as "sandbox" | "live") ?? "sandbox";
        for (const env of primary === "live" ? (["live", "sandbox"] as const) : (["sandbox", "live"] as const)) {
          try {
            const invoice = await createStripeClient(env).invoices.retrieve(String(inv.stripe_invoice_id));
            inv.status = invoice.status ?? inv.status;
            inv.public_url = invoice.hosted_invoice_url ?? inv.public_url;
            paid = invoice.status === "paid";
            reference = invoice.number ?? reference;
            break;
          } catch { /* try other environment */ }
        }
      } else if (method === "square" && inv.square_invoice_id && process.env.SQUARE_ACCESS_TOKEN) {
        const base = (process.env.SQUARE_ENVIRONMENT ?? "production").toLowerCase() === "sandbox"
          ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
        const res = await fetch(`${base}/v2/invoices/${inv.square_invoice_id}`, {
          headers: { Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`, "Square-Version": "2024-10-17" },
        });
        if (res.ok) {
          const body: any = await res.json();
          inv.status = body?.invoice?.status ?? inv.status;
          inv.public_url = body?.invoice?.public_url ?? inv.public_url;
          paid = inv.status === "PAID";
        }
      }
      await supabaseAdmin.from("order_invoices")
        .update({ status: inv.status, public_url: inv.public_url, last_synced_at: new Date().toISOString() })
        .eq("order_id", orderId);
      if (paid) {
        const { data: o } = await supabaseAdmin.from("orders").select("paid_at").eq("id", orderId).maybeSingle();
        if (o && !o.paid_at) await supabaseAdmin.from("orders").update({ paid_at: new Date().toISOString() }).eq("id", orderId);
        const { postOrderPaymentReceivedNotice } = await import("@/lib/order-payment-notice.server");
        await postOrderPaymentReceivedNotice({
          orderId,
          provider: method === "stripe" ? "Stripe" : "Square",
          reference: reference ?? undefined,
          receiptUrl: inv.public_url ?? null,
        } as any).catch(() => undefined);
      }
    } catch { /* status check is best-effort */ }
  }
  return { status: String(inv.status ?? ""), url: (inv.public_url as string | null) ?? null, number: (inv.invoice_number as string | null) ?? null };
}

export const getCheckout = createServerFn({ method: "POST" })
  .inputValidator((d) => creds.parse(d))
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) return { ok: false as const };
    const { supabaseAdmin, link } = u;
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,order_ref,shipping_name,total_cents,discount_cents,paid_at,completed_at,created_at,manual_pay_method,status")
      .eq("id", link.order_id)
      .maybeSingle();
    if (!order) return { ok: false as const };
    const { data: items } = await supabaseAdmin
      .from("order_items").select("product_name,quantity,unit_price_cents").eq("order_id", link.order_id);
    const method = String(order.manual_pay_method ?? "");
    const invoice = !order.paid_at && (method === "stripe" || method === "square")
      ? await syncInvoice(supabaseAdmin, link.order_id, method)
      : null;
    const { data: fresh } = await supabaseAdmin.from("orders").select("paid_at,completed_at").eq("id", link.order_id).maybeSingle();
    let bank: null | { account_name: string | null; sort_code: string | null; account_number: string | null; iban: string | null; bic: string | null } = null;
    if (method === "wise") {
      const { data: b } = await supabaseAdmin.from("bank_transfer_details").select("account_name,sort_code,account_number,iban,bic").limit(1).maybeSingle();
      bank = b ?? null;
    }
    return {
      ok: true as const,
      order: {
        ref: order.order_ref ?? String(order.id).slice(0, 8),
        name: order.shipping_name ?? "",
        totalCents: Number(order.total_cents ?? 0),
        discountCents: Number(order.discount_cents ?? 0),
        createdAt: String(order.created_at),
        paidAt: (fresh?.paid_at ?? order.paid_at) as string | null,
        completedAt: (fresh?.completed_at ?? order.completed_at) as string | null,
        cancelled: String(order.status) === "cancelled",
        method,
        customerKind: link.customer_kind as "new" | "existing",
      },
      items: (items ?? []).map((i: any) => ({ name: String(i.product_name ?? "Item"), qty: Number(i.quantity ?? 1), unitCents: Number(i.unit_price_cents ?? 0) })),
      invoice,
      bank,
    };
  });

export const listCheckoutChat = createServerFn({ method: "POST" })
  .inputValidator((d) => creds.parse(d))
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) return { ok: false as const, messages: [] };
    const { data: rows } = await u.supabaseAdmin
      .from("checkout_chat_messages").select("id,sender,content,created_at")
      .eq("order_id", u.link.order_id).order("created_at").limit(300);
    return { ok: true as const, messages: (rows ?? []) as { id: string; sender: string; content: string; created_at: string }[] };
  });

export const sendCheckoutChat = createServerFn({ method: "POST" })
  .inputValidator((d) => creds.extend({ content: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) return { ok: false as const };
    const { error } = await u.supabaseAdmin.from("checkout_chat_messages")
      .insert({ order_id: u.link.order_id, sender: "customer", content: data.content });
    if (error) return { ok: false as const };
    // Alert staff (bell + phone/browser push via staff_notifications trigger).
    // Throttle: one alert per order per 2 minutes so a burst of messages doesn't spam.
    try {
      const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { count } = await u.supabaseAdmin.from("staff_notifications")
        .select("id", { count: "exact", head: true })
        .eq("kind", "checkout_chat").eq("entity_id", u.link.order_id).gte("created_at", since);
      if (!count) {
        const preview = data.content.length > 120 ? data.content.slice(0, 117) + "…" : data.content;
        await u.supabaseAdmin.from("staff_notifications").insert({
          kind: "checkout_chat",
          title: "New checkout chat message — reply needed",
          body: `Customer wrote: "${preview}"`,
          link_path: `/admin?tab=order-status&chat=${u.link.order_id}`,
          entity_id: u.link.order_id,
        } as never);
      }
    } catch (e) {
      console.error("Checkout chat staff alert failed:", e);
    }
    return { ok: true as const };
  });
