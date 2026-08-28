import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

const FINAL_PAYMENT_STATUSES = new Set(["COMPLETED", "completed", "finished"]);

async function assertAdminOrOrderOwner(supabase: any, userId: string, orderId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "management"]);
  if (roles && roles.length > 0) return;
  const { data: order } = await supabase.from("orders").select("user_id").eq("id", orderId).maybeSingle();
  if (!order || order.user_id !== userId) throw new Error("Not authorized");
}

async function getOrderPayment(orderId: string) {
  const { data } = await supabaseAdmin
    .from("order_payments")
    .select("provider,provider_payment_id,status,amount_cents,currency,card_brand,last_4,receipt_url")
    .eq("order_id", orderId)
    .maybeSingle();
  return data as any | null;
}

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
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
  });
  return created.id;
}

export const getStripeWebConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { environment: (process.env.STRIPE_ENVIRONMENT as StripeEnv) ?? "sandbox" };
  });

export const createStripePaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ orderId: z.string().uuid(), environment: z.enum(["sandbox", "live"]), returnUrl: z.string() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ clientSecret: string; paymentIntentId: string } | { error: string }> => {
    try {
      const { supabase, userId } = context;
      await assertAdminOrOrderOwner(supabase, userId, data.orderId);

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id,total_cents,paid_at")
        .eq("id", data.orderId)
        .single();
      if (orderErr || !order) throw new Error(orderErr?.message || "Order not found");
      if (order.paid_at) throw new Error("Order is already paid");
      if (!order.total_cents || order.total_cents <= 0) throw new Error("Order total must be greater than zero");

      const existingPayment = await getOrderPayment(String(order.id));
      if (existingPayment) {
        if (FINAL_PAYMENT_STATUSES.has(String(existingPayment.status ?? ""))) {
          throw new Error("Order is already paid");
        }
        if (existingPayment.provider && existingPayment.provider !== "stripe") {
          throw new Error(`This order already has a ${existingPayment.provider} payment in progress`);
        }
        if (existingPayment.provider_payment_id) {
          try {
            const stripe = createStripeClient(data.environment);
            const existingSession = await stripe.checkout.sessions.retrieve(existingPayment.provider_payment_id);
            if (existingSession.payment_status === "paid") {
              throw new Error("Payment has already completed. Refresh the order status.");
            }
            if (
              existingSession.client_secret &&
              existingSession.status !== "expired" &&
              Number(existingSession.amount_total) === Number(order.total_cents) &&
              String(existingSession.currency).toLowerCase() === "gbp"
            ) {
              return {
                clientSecret: existingSession.client_secret as string,
                paymentIntentId: existingSession.id as string,
              };
            }
          } catch (e: any) {
            if (/already completed|already paid|different/i.test(e?.message || "")) throw e;
          }
        }
      }

      let customerEmail: string | undefined;
      let customerName: string | undefined;
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        customerEmail = authUser?.user?.email ?? undefined;
        const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, any>;
        customerName = meta.full_name || meta.name || meta.display_name || undefined;
      } catch {}
      if (!customerName) {
        try {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("display_name,full_name,username")
            .eq("id", userId)
            .maybeSingle();
          customerName =
            (profile as any)?.display_name || (profile as any)?.full_name || (profile as any)?.username || undefined;
        } catch {}
      }

      const stripe = createStripeClient(data.environment);
      const customerId = await resolveOrCreateCustomer(stripe, {
        email: customerEmail,
        userId,
      });

      // Load the purchased items so the checkout shows what was bought,
      // alongside the order number and the customer's name.
      const shortRef = String(order.id).slice(0, 8);
      const { data: orderItems } = await supabaseAdmin
        .from("order_items")
        .select("product_name,quantity,unit_price_cents")
        .eq("order_id", String(order.id));

      const itemsTotal = (orderItems ?? []).reduce(
        (sum, it: any) => sum + (it.unit_price_cents ?? 0) * (it.quantity ?? 0),
        0,
      );

      const purchasedBy = customerName ? `Purchased by ${customerName}` : undefined;

      const lineItems =
        orderItems && orderItems.length > 0 && itemsTotal === order.total_cents
          ? orderItems.map((it: any) => ({
              price_data: {
                currency: "gbp",
                product_data: {
                  name: `Order #${shortRef} — ${it.product_name}`,
                  ...(purchasedBy ? { description: purchasedBy } : {}),
                },
                unit_amount: it.unit_price_cents,
              },
              quantity: it.quantity ?? 1,
            }))
          : [
              {
                price_data: {
                  currency: "gbp",
                  product_data: {
                    name:
                      orderItems && orderItems.length > 0
                        ? `Order #${shortRef} — ${orderItems.map((i: any) => i.product_name).join(", ")}`
                        : `Order #${shortRef}`,
                    ...(purchasedBy ? { description: purchasedBy } : {}),
                  },
                  unit_amount: order.total_cents,
                },
                quantity: 1,
              },
            ];

      const itemsSummary =
        orderItems && orderItems.length > 0
          ? orderItems.map((i: any) => `${i.quantity ?? 1}x ${i.product_name}`).join(", ")
          : undefined;

      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          ui_mode: "embedded_page",
          line_items: lineItems,
          return_url: data.returnUrl,
          ...(customerId ? { customer: customerId } : {}),
          payment_intent_data: {
            description: `Order #${shortRef}${itemsSummary ? ` — ${itemsSummary}` : ""}${customerName ? ` (${customerName})` : ""}`.slice(0, 1000),
            metadata: {
              order_id: String(order.id),
              user_id: userId,
              ...(customerName ? { customer_name: customerName } : {}),
              ...(itemsSummary ? { items: itemsSummary.slice(0, 450) } : {}),
            },
          },
          metadata: {
            order_id: String(order.id),
            user_id: userId,
            ...(customerName ? { customer_name: customerName } : {}),
            ...(itemsSummary ? { items: itemsSummary.slice(0, 450) } : {}),
          },
        } as any,
      );

      if (!session.client_secret) throw new Error("Stripe did not return a client_secret");

      await supabaseAdmin.from("order_payments").upsert(
        {
          order_id: String(order.id),
          provider: "stripe",
          provider_payment_id: session.id,
          square_payment_id: session.id,
          status: "PENDING",
          amount_cents: order.total_cents,
          currency: "GBP",
          created_by: userId,
        },
        { onConflict: "order_id" },
      );

      return { clientSecret: session.client_secret as string, paymentIntentId: session.id as string };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const confirmStripePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ orderId: z.string().uuid(), sessionId: z.string().min(4).max(256).optional(), environment: z.enum(["sandbox", "live"]) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ status: string; amountCents: number; cardBrand?: string; last4?: string; receiptUrl?: string; ticketId?: string } | { error: string }> => {
    try {
      const { supabase, userId } = context;
      await assertAdminOrOrderOwner(supabase, userId, data.orderId);

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id,total_cents,paid_at,user_id")
        .eq("id", data.orderId)
        .single();

      if (orderErr || !order) throw new Error(orderErr?.message || "Order not found");
      if (order.paid_at) {
        // Already settled (e.g. a previous check or a repaired paid state) —
        // still make sure the automated thank-you notice exists on the ticket.
        try {
          const existing = await getOrderPayment(String(order.id));
          const { postOrderPaymentReceivedNotice } = await import("@/lib/order-payment-notice.server");
          const notice = await postOrderPaymentReceivedNotice({
            orderId: String(order.id),
            provider: existing?.provider === "square" ? "Square" : "Stripe",
            amountCents: order.total_cents ?? 0,
            reference: existing?.provider_payment_id ? String(existing.provider_payment_id) : null,
            actorId: userId,
            paidAt: order.paid_at,
          });
          return { status: "already_paid", amountCents: order.total_cents ?? 0, ticketId: notice.ticketId };
        } catch (e) {
          console.error("Failed to post payment notice for already-paid order:", e);
        }
        return { status: "already_paid", amountCents: order.total_cents ?? 0 };
      }

      const totalCents = order.total_cents ?? 0;
      if (totalCents <= 0) throw new Error("Order total must be greater than zero");

      const existingPayment = await getOrderPayment(String(order.id));
      const sessionId = data.sessionId ??
        (existingPayment?.provider === "stripe" ? String(existingPayment.provider_payment_id ?? "") : "");
      if (!sessionId) throw new Error("No Stripe payment found for this order");
      if (existingPayment) {
        if (FINAL_PAYMENT_STATUSES.has(String(existingPayment.status ?? ""))) {
          if (existingPayment.provider_payment_id !== sessionId) {
            throw new Error("Payment is already recorded for this order. Refresh the order status.");
          }
        }
        if (existingPayment.provider && existingPayment.provider !== "stripe") {
          throw new Error(`This order already has a ${existingPayment.provider} payment in progress`);
        }
      }

      const stripe = createStripeClient(data.environment);
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent"],
      });

      if (session.payment_status !== "paid") {
        throw new Error(`Stripe payment status: ${session.payment_status ?? "unknown"}`);
      }
      if (Number(session.amount_total) !== totalCents) throw new Error("Stripe amount mismatch");
      if (session.metadata?.order_id && session.metadata.order_id !== String(order.id)) {
        throw new Error("Stripe order metadata mismatch");
      }

      const pi = session.payment_intent as any;
      let cardBrand: string | undefined;
      let last4: string | undefined;
      let receiptUrl: string | undefined;
      if (pi?.charges?.data?.[0]) {
        const ch = pi.charges.data[0];
        cardBrand = ch?.payment_method_details?.card?.brand ?? undefined;
        last4 = ch?.payment_method_details?.card?.last4 ?? undefined;
        receiptUrl = ch?.receipt_url ?? undefined;
      }

      await supabaseAdmin.from("order_payments").upsert(
        {
          order_id: String(order.id),
          provider: "stripe",
          provider_payment_id: session.id,
          square_payment_id: session.id,
          status: "COMPLETED",
          amount_cents: totalCents,
          currency: "GBP",
          card_brand: cardBrand,
          last_4: last4,
          receipt_url: receiptUrl,
          created_by: userId,
        },
        { onConflict: "order_id" },
      );

      const { error: paidErr } = await supabaseAdmin.rpc("mark_order_paid" as never, {
        p_order_id: String(order.id),
        p_transaction_id: pi?.id ?? session.id,
      } as never);
      if (paidErr) {
        const { error: fallbackPaidErr } = await supabaseAdmin
          .from("orders")
          .update({ paid_at: new Date().toISOString(), paid_by: userId })
          .eq("id", String(order.id));
        if (fallbackPaidErr) throw new Error(fallbackPaidErr.message);
      }

      // Don't duplicate the automated notice if a previous check (Stripe or
      // Square) already posted one for this order.
      let alreadyNotified = false;
      try {
        const { data: priorMsgs } = await supabaseAdmin
          .from("order_messages")
          .select("content")
          .eq("order_id", String(order.id));
        alreadyNotified = (priorMsgs ?? []).some((m: { content: string | null }) => {
          const c = m.content ?? "";
          return c.includes("Payment received via") || c.includes("Card payment captured via Stripe");
        });
      } catch {
        alreadyNotified = false;
      }

      try {
        if (!alreadyNotified) {
          await supabaseAdmin.from("order_messages").insert({
            order_id: String(order.id),
            sender_id: userId,
            content: `✅ Card payment captured via Stripe${cardBrand && last4 ? ` (${cardBrand} •••• ${last4})` : ""}.`,
          });
        }
      } catch (e) {
        console.error("Failed to post Stripe payment message to order:", e);
      }


      let ticketId: string | undefined;
      try {
        // Build a staff-ready summary: items, total and customer details so
        // support can action the order without cross-checking other screens.
        const orderUserId = (order as { user_id?: string }).user_id ?? userId;
        const [{ data: items }, { data: profile }] = await Promise.all([
          supabaseAdmin
            .from("order_items")
            .select("product_name,quantity,unit_price_cents")
            .eq("order_id", String(order.id)),
          supabaseAdmin
            .from("profiles")
            .select("username,display_name")
            .eq("id", orderUserId)
            .maybeSingle(),
        ]);

        const itemLines = (items ?? []).map(
          (it: { product_name: string | null; quantity: number | null; unit_price_cents: number | null }) =>
            `• ${it.quantity ?? 1} × ${it.product_name ?? "Item"} — £${(((it.unit_price_cents ?? 0) * (it.quantity ?? 1)) / 100).toFixed(2)}`,
        );
        const customerLines = [
          profile?.display_name ? `Name: ${profile.display_name}` : null,
          profile?.username ? `Username: @${profile.username}` : null,
          session.customer_details?.email ? `Email: ${session.customer_details.email}` : null,
          `User ID: ${orderUserId}`,
        ].filter(Boolean);

        const content =
          `✅ Card payment captured via Stripe for order #${String(order.id).slice(0, 8)}` +
          `${cardBrand && last4 ? ` (${cardBrand} •••• ${last4})` : ""}` +
          ` — £${(totalCents / 100).toFixed(2)}.` +
          `\nPurchase ref: ${pi?.id ?? session.id}` +
          (receiptUrl ? `\nReceipt: ${receiptUrl}` : "") +
          (itemLines.length ? `\n\n🛒 Items:\n${itemLines.join("\n")}` : "") +
          `\nTotal: £${(totalCents / 100).toFixed(2)} GBP`;

        // Staff-only version adds customer contact details (email is
        // admin/management-only and must not appear on customer-visible tickets).
        const staffContent = `${content}\n\n👤 Customer:\n${customerLines.join("\n")}`;

        const { data: linkedTickets } = await supabaseAdmin.from("tickets").select("id,user_id").eq("order_id", String(order.id));
        if (linkedTickets && linkedTickets.length > 0) {
          ticketId = String(linkedTickets[0]!.id);
          if (!alreadyNotified) {
            await supabaseAdmin.from("ticket_messages").insert(
              linkedTickets.map((t: { id: string }) => ({
                ticket_id: t.id,
                sender_id: userId,
                content,
              })),
            );
          }
        } else if (!alreadyNotified) {

          // No ticket linked yet (e.g. order created outside the shop flow) —
          // open one in the admin/management-only "Orders" category so the
          // purchase reference is always tracked in support.
          const { data: ordersCat } = await supabaseAdmin
            .from("ticket_categories")
            .select("id")
            .eq("slug", "orders")
            .maybeSingle();
          if (ordersCat?.id) {
            const { data: ticket } = await supabaseAdmin
              .from("tickets")
              .insert({
                user_id: (order as { user_id?: string }).user_id ?? userId,
                category_id: ordersCat.id,
                subject: `Order #${String(order.id).slice(0, 8)} — Stripe payment received`,
                priority: "normal",
                order_id: String(order.id),
              } as never)
              .select("id")
              .single();
            if (ticket?.id) {
              ticketId = String(ticket.id);
              await supabaseAdmin.from("ticket_messages").insert({
                ticket_id: ticket.id,
                sender_id: userId,
                content: `🧾 Order ID: ${order.id}\n\n${staffContent}`,
              } as never);
            }
          }
        }
      } catch (e) {
        console.error("Failed to post Stripe payment message to ticket:", e);
      }

      return { status: "COMPLETED", amountCents: totalCents, cardBrand, last4, receiptUrl, ticketId };

    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
