import { supabaseAdmin } from "@/integrations/supabase/client.server";

type NoticeInput = {
  orderId: string;
  /** Payment provider label shown in the automated message. */
  provider: "Square" | "Stripe" | string;
  /** Total paid, in minor units (pence). */
  amountCents?: number | null;
  /** Provider reference (payment intent / invoice number / transaction id). */
  reference?: string | null;
  receiptUrl?: string | null;
  /** Who triggered the check (used as sender on the automated message). */
  actorId?: string | null;
  /** When the payment was confirmed (ISO). Defaults to now. */
  paidAt?: string | null;
};

/**
 * Posts the automated "payment received" message for an order to the order
 * thread and to the linked support ticket. When no ticket is linked yet, an
 * "Orders" ticket is opened so the purchase reference is always tracked.
 *
 * Idempotent: if an automated payment notice already exists for the order it
 * does nothing, so repeated "I've paid" checks never duplicate messages.
 */
export async function postOrderPaymentReceivedNotice(input: NoticeInput): Promise<{ ticketId?: string; posted: boolean }> {
  const { orderId, provider } = input;
  const marker = `PAYMENT-RECEIVED:${orderId}`;

  const { data: existing } = await supabaseAdmin
    .from("order_messages")
    .select("id,content")
    .eq("order_id", orderId);
  const alreadyNotified = (existing ?? []).some((m: { content: string | null }) => {
    const c = m.content ?? "";
    return c.includes(marker) || c.includes("Payment received via") || c.includes("Card payment captured via Stripe");
  });
  if (alreadyNotified) return { posted: false };


  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,user_id,total_cents")
    .eq("id", orderId)
    .maybeSingle();
  const orderUserId = (order as { user_id?: string } | null)?.user_id ?? input.actorId ?? null;
  const totalCents = input.amountCents ?? (order as { total_cents?: number } | null)?.total_cents ?? 0;
  const senderId = input.actorId ?? orderUserId;

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("product_name,quantity,unit_price_cents")
    .eq("order_id", orderId);

  const itemLines = (items ?? []).map(
    (it: { product_name: string | null; quantity: number | null; unit_price_cents: number | null }) =>
      `• ${it.quantity ?? 1} × ${it.product_name ?? "Item"} — £${(((it.unit_price_cents ?? 0) * (it.quantity ?? 1)) / 100).toFixed(2)}`,
  );

  const paidAtDate = input.paidAt ? new Date(input.paidAt) : new Date();
  const paidStamp = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(paidAtDate);

  const content =
    `✅ Payment received via ${provider} for order #${orderId.slice(0, 8)} — £${(totalCents / 100).toFixed(2)} GBP.` +
    `\nPayment date: ${paidStamp} (UK time)` +
    (input.reference ? `\nPurchase ref: ${input.reference}` : "") +
    (input.receiptUrl ? `\nReceipt: ${input.receiptUrl}` : "") +
    (itemLines.length ? `\n\n🛒 Items:\n${itemLines.join("\n")}` : "") +
    `\n\n🙏 Thank you for your payment — we really appreciate your custom. Your order is now being processed and we'll update you on this ticket.` +
    `\n\n(${marker})`;

  try {
    await supabaseAdmin.from("order_messages").insert({
      order_id: orderId,
      sender_id: senderId,
      content,
    } as never);
  } catch (e) {
    console.error("Failed to post payment notice to order thread:", e);
  }

  let ticketId: string | undefined;
  try {
    const { data: linkedTickets } = await supabaseAdmin.from("tickets").select("id").eq("order_id", orderId);
    if (linkedTickets && linkedTickets.length > 0) {
      ticketId = String(linkedTickets[0]!.id);
      await supabaseAdmin.from("ticket_messages").insert(
        linkedTickets.map((t: { id: string }) => ({
          ticket_id: t.id,
          sender_id: senderId,
          content,
        })) as never,
      );
    } else {
      const { data: ordersCat } = await supabaseAdmin
        .from("ticket_categories")
        .select("id")
        .eq("slug", "orders")
        .maybeSingle();
      if (ordersCat?.id && orderUserId) {
        const { data: ticket } = await supabaseAdmin
          .from("tickets")
          .insert({
            user_id: orderUserId,
            category_id: ordersCat.id,
            subject: `Order #${orderId.slice(0, 8)} — ${provider} payment received`,
            priority: "normal",
            order_id: orderId,
          } as never)
          .select("id")
          .single();
        if (ticket?.id) {
          ticketId = String(ticket.id);
          await supabaseAdmin.from("ticket_messages").insert({
            ticket_id: ticket.id,
            sender_id: senderId,
            content: `🧾 Order ID: ${orderId}\n\n${content}`,
          } as never);
        }
      }
    }
  } catch (e) {
    console.error("Failed to post payment notice to ticket:", e);
  }

  return { ticketId, posted: true };
}
