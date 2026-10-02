import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

/**
 * Stripe invoices that mirror the Square invoice flow for orders:
 *  - createStripeInvoiceForOrder  → build, finalise and store a Stripe invoice,
 *    then post the pay link into the order chat (the support ticket shows it).
 *  - refreshStripeInvoiceStatus   → read the invoice back; when Stripe reports
 *    it PAID, mark the order paid and post the automated payment notice.
 *  - voidStripeInvoiceForOrder    → void the invoice when the order is cancelled.
 *
 * No Stripe email is sent — the link is shared through the ticket, exactly like
 * the Square invoice flow.
 */

type StripeInvoiceRow = {
  id: string;
  order_id: string;
  stripe_invoice_id: string;
  invoice_number: string | null;
  public_url: string | null;
  status: string;
  amount_cents: number;
  currency: string;
  ticketId?: string | null;
};

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

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string; name?: string },
): Promise<string | undefined> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  if (!options.email && !options.userId) return undefined;
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
    ...(options.name && { name: options.name }),
  });
  return created.id;
}

export const createStripeInvoiceForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ orderId: z.string().uuid(), environment: z.enum(["sandbox", "live"]) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<StripeInvoiceRow | { error: string }> => {
    try {
      const { supabase, userId } = context;
      await assertAdminOrOrderOwner(supabase, userId, data.orderId);
      throw new Error("Stripe hosted invoices are no longer used. Send the customer their secure checkout link; BM Support provides the invoice after payment.");

      const stripe = createStripeClient(data.environment);

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id,user_id,total_cents,shipping_name,email,paid_at")
        .eq("id", data.orderId)
        .single();
      if (orderErr || !order) throw new Error(orderErr?.message || "Order not found");
      const orderId = String(order.id);
      if (order.paid_at) throw new Error("Order is already paid");
      if (!order.email) throw new Error("Order has no email address");
      const totalCents = Number(order.total_cents ?? 0);
      if (totalCents <= 0) throw new Error("Order total must be greater than zero");

      // Reuse an existing open Stripe invoice so repeated clicks don't pile up
      // unpaid invoices in Stripe.
      const { data: existingRow } = await supabase
        .from("order_invoices")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();
      if (existingRow?.stripe_invoice_id) {
        try {
          const existing = await stripe.invoices.retrieve(String(existingRow.stripe_invoice_id));
          if (existing.status === "paid") throw new Error("Invoice has already been paid");
          if (existing.status === "open") {
            return {
              id: String(existingRow.id),
              order_id: orderId,
              stripe_invoice_id: String(existingRow.stripe_invoice_id),
              invoice_number: (existingRow.invoice_number as string | null) ?? null,
              public_url: existing.hosted_invoice_url ?? (existingRow.public_url as string | null) ?? null,
              status: existing.status ?? String(existingRow.status ?? "open"),
              amount_cents: Number(existingRow.amount_cents ?? totalCents),
              currency: String(existingRow.currency ?? "GBP"),
            };
          }
        } catch (e: any) {
          if (/already been paid/i.test(e?.message || "")) throw e;
        }
      }

      let customerName: string | undefined = order.shipping_name || undefined;
      let customerEmail: string | undefined = order.email;
      const customerId = await resolveOrCreateCustomer(stripe, {
        email: customerEmail,
        userId,
        name: customerName,
      });
      if (!customerId) throw new Error("Failed to resolve Stripe customer");

      const shortRef = orderId.slice(0, 8);

      // On the current Stripe API, invoice items must be attached to a draft
      // invoice explicitly (they no longer auto-attach). Create the draft
      // first, then add each item, then finalise.
      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "send_invoice",
        days_until_due: 1,
        currency: "gbp",
        payment_settings: { payment_method_types: ["card"] },
        metadata: {
          order_id: orderId,
          user_id: userId,
        },
        description: `Order #${shortRef}`,
      } as never);
      if (!invoice.id) throw new Error("Failed to create Stripe invoice");

      // Load items so the invoice shows what was purchased.
      const { data: items } = await supabaseAdmin
        .from("order_items")
        .select("product_name,quantity,unit_price_cents")
        .eq("order_id", orderId);
      const itemsTotal = (items ?? []).reduce(
        (sum, it: any) => sum + (it.unit_price_cents ?? 0) * (it.quantity ?? 0),
        0,
      );

      // The dahlia API takes decimal-string amounts on invoice items
      // (unit_amount_decimal, in cents) instead of the integer unit_amount.
      const perItem =
        items && items.length > 0 && itemsTotal === totalCents
          ? items.map((it: any) => ({
              customer: customerId,
              invoice: invoice.id,
              currency: "gbp",
              unit_amount_decimal: String(it.unit_price_cents),
              quantity: it.quantity ?? 1,
              description: `Order #${shortRef} — ${it.product_name ?? "Item"}`.slice(0, 500),
            }))
          : [
              {
                customer: customerId,
                invoice: invoice.id,
                currency: "gbp",
                unit_amount_decimal: String(totalCents),
                quantity: 1,
                description: `Order #${shortRef}`.slice(0, 500),
              },
            ];

      for (const item of perItem) {
        await stripe.invoiceItems.create(item as never);
      }

      const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
      if (!finalized.hosted_invoice_url) throw new Error("Stripe invoice has no payment link");
      // A zero-total invoice finalises as "paid" with no money changing hands —
      // treat an amount mismatch as a failure rather than free access.
      if (Number(finalized.total ?? 0) !== totalCents) {
        try {
          await stripe.invoices.voidInvoice(finalized.id);
        } catch {}
        throw new Error("Stripe invoice amount mismatch — invoice voided, please try again");
      }

      const row = {
        order_id: orderId,
        stripe_invoice_id: finalized.id,
        square_invoice_id: (existingRow?.square_invoice_id as string | null) ?? null,
        invoice_number: finalized.number ?? null,
        public_url: finalized.hosted_invoice_url ?? null,
        status: finalized.status ?? "open",
        amount_cents: totalCents,
        currency: "GBP",
        created_by: userId,
        last_synced_at: new Date().toISOString(),
      };
      const { data: saved, error: upErr } = await supabase
        .from("order_invoices")
        .upsert(row, { onConflict: "order_id" })
        .select()
        .single();
      if (upErr) throw new Error(upErr.message);

      return {
        id: String((saved as any)?.id ?? ""),
        order_id: orderId,
        stripe_invoice_id: finalized.id,
        invoice_number: finalized.number ?? null,
        public_url: finalized.hosted_invoice_url ?? null,
        status: finalized.status ?? "open",
        amount_cents: totalCents,
        currency: "GBP",
      };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const refreshStripeInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ orderId: z.string().uuid(), environment: z.enum(["sandbox", "live"]) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<StripeInvoiceRow | { error: string }> => {
    try {
      const { supabase, userId } = context;
      await assertAdminOrOrderOwner(supabase, userId, data.orderId);

      const { data: row } = await supabase
        .from("order_invoices")
        .select("*")
        .eq("order_id", data.orderId)
        .single();
      if (!row) throw new Error("No Stripe invoice for this order");
      if (!row.stripe_invoice_id) throw new Error("No Stripe invoice for this order");

      const stripe = createStripeClient(data.environment);
      const invoice = await stripe.invoices.retrieve(String(row.stripe_invoice_id));
      if (!invoice) throw new Error("Stripe invoice not found");

      const { data: order } = await supabase
        .from("orders")
        .select("id,total_cents,paid_at")
        .eq("id", data.orderId)
        .maybeSingle();
      const totalCents = Number(order?.total_cents ?? 0);
      if (totalCents > 0 && Number(invoice.total) !== totalCents) {
        throw new Error("Stripe invoice amount mismatch — please generate a fresh invoice");
      }

      const { data: updated, error } = await supabase
        .from("order_invoices")
        .update({
          status: invoice.status ?? row.status,
          public_url: invoice.hosted_invoice_url ?? row.public_url,
          invoice_number: invoice.number ?? row.invoice_number,
          last_synced_at: new Date().toISOString(),
        })
        .eq("order_id", data.orderId)
        .select()
        .single();
      if (error) throw new Error(error.message);

      // When Stripe reports the invoice as PAID, mark the order paid and post
      // the automated "payment received" notice to the order + support ticket.
      if (invoice.status === "paid") {
        if (order && !order.paid_at) {
          const { error: paidErr } = await supabaseAdmin
            .from("orders")
            .update({ paid_at: new Date().toISOString() })
            .eq("id", data.orderId);
          if (paidErr) throw new Error(paidErr.message);
        }
        const { postOrderPaymentReceivedNotice } = await import("@/lib/order-payment-notice.server");
        const notice = await postOrderPaymentReceivedNotice({
          orderId: data.orderId,
          provider: "Stripe",
          reference: invoice.number ?? row.invoice_number ?? row.stripe_invoice_id,
          receiptUrl: invoice.hosted_invoice_url ?? row.public_url ?? null,
          actorId: userId,
        });
        return {
          id: String(updated?.id ?? row.id),
          order_id: data.orderId,
          stripe_invoice_id: String(row.stripe_invoice_id),
          invoice_number: invoice.number ?? null,
          public_url: invoice.hosted_invoice_url ?? null,
          status: invoice.status ?? "paid",
          amount_cents: Number(row.amount_cents ?? totalCents),
          currency: String(row.currency ?? "GBP"),
          ticketId: notice.ticketId ?? null,
        };
      }

      return {
        id: String(updated?.id ?? row.id),
        order_id: data.orderId,
        stripe_invoice_id: String(row.stripe_invoice_id),
        invoice_number: (updated as any)?.invoice_number ?? null,
        public_url: (updated as any)?.public_url ?? null,
        status: invoice.status ?? String(row.status ?? "open"),
        amount_cents: Number(row.amount_cents ?? totalCents),
        currency: String(row.currency ?? "GBP"),
      };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/**
 * Void any open Stripe invoice for an order. Uses the configured Stripe
 * environment first, falling back to the other one so cancellation works
 * whichever environment the invoice was raised in.
 */
export async function voidStripeInvoiceForOrder(orderId: string) {
  const { data: row, error: rowError } = await supabaseAdmin
    .from("order_invoices")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (rowError) throw new Error(rowError.message);
  if (!row?.stripe_invoice_id) throw new Error("No Stripe invoice for this order");

  const invoiceId = String(row.stripe_invoice_id);
  const primary = ((process.env.STRIPE_ENVIRONMENT as StripeEnv) ?? "sandbox") as StripeEnv;
  const envs: StripeEnv[] = primary === "live" ? ["live", "sandbox"] : ["sandbox", "live"];

  let invoice: any = null;
  let lastError: unknown = null;
  for (const env of envs) {
    try {
      const stripe = createStripeClient(env);
      invoice = await stripe.invoices.retrieve(invoiceId);
      if (invoice) break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!invoice) {
    throw lastError instanceof Error ? lastError : new Error("Stripe invoice not found");
  }

  const status = String(invoice.status ?? "").toLowerCase();
  if (status !== "paid" && status !== "void") {
    await createStripeClient(
      (primary && envs.includes(primary) ? primary : "sandbox") as StripeEnv,
    ).invoices.voidInvoice(invoiceId);
  }

  const { data: updated, error } = await supabaseAdmin
    .from("order_invoices")
    .update({
      status: status === "paid" ? "PAID" : "VOID",
      last_synced_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return updated ?? row;
}
