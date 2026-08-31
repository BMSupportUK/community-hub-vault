import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Input = {
  orderId: string;
  reference: string;
  amountCents: number;
  actorId?: string | null;
};

/**
 * Posts the automated "customer says they've sent a bank transfer" message to
 * the order thread and the linked support ticket so staff can verify it.
 * Idempotent — repeat presses never duplicate the message.
 */
export async function postBankTransferReportedNotice(
  input: Input,
): Promise<{ ticketId?: string; posted: boolean }> {
  const { orderId, reference, amountCents } = input;
  const marker = `BANK-TRANSFER-REPORTED:${orderId}`;

  const { data: existing } = await supabaseAdmin
    .from("order_messages")
    .select("id,content")
    .eq("order_id", orderId);
  if ((existing ?? []).some((m: { content: string | null }) => (m.content ?? "").includes(marker))) {
    return { posted: false };
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,user_id")
    .eq("id", orderId)
    .maybeSingle();
  const orderUserId = (order as { user_id?: string } | null)?.user_id ?? input.actorId ?? null;
  const senderId = input.actorId ?? orderUserId;

  const stamp = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date());

  const content =
    `🏦 Bank transfer reported by the customer for order #${orderId.slice(0, 8)} — £${(amountCents / 100).toFixed(2)} GBP.` +
    `\nPayment reference: ${reference}` +
    `\nReported: ${stamp} (UK time)` +
    `\n\n⏳ Awaiting verification — please check the bank account and confirm the payment on this order once the funds have landed.` +
    `\n\n(${marker})`;

  try {
    await supabaseAdmin.from("order_messages").insert({
      order_id: orderId,
      sender_id: senderId,
      content,
    } as never);
  } catch (e) {
    console.error("Failed to post bank transfer notice to order thread:", e);
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
            subject: `Order #${orderId.slice(0, 8)} — bank transfer sent (needs checking)`,
            priority: "high",
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
    console.error("Failed to post bank transfer notice to ticket:", e);
  }

  return { ticketId, posted: true };
}
