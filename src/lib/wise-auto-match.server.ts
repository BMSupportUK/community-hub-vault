import type { SupabaseClient } from "@supabase/supabase-js";
import { getAutomatedMessageServer } from "@/lib/automated-messages.server";
import { postOrderPaymentReceivedNotice } from "@/lib/order-payment-notice.server";
import { listAwaitingBankOrders } from "@/lib/bank-awaiting.server";

/**
 * Automatic Wise payment matching.
 *
 * A payment email is auto-matched — and its order marked as received — only
 * when it is unambiguous: the order's unique payment reference (BM-xxxxxx)
 * appears in the email, exactly ONE order is awaiting a bank transfer with
 * that reference, and the amount matches to the penny in GBP. Anything else
 * (no match, several candidates, amount mismatch) stays for manual
 * allocation on the Bank Transfer page.
 */

type Admin = SupabaseClient;

function normalizeCode(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}


/** The Wise transfer number (e.g. #2392929350) if the email text carries one. */
function extractTransferNumber(...texts: (string | null | undefined)[]) {
  for (const t of texts) {
    if (!t) continue;
    const m = t.match(/#\s?\d{6,}/) ?? t.match(/\b\d{9,}\b/);
    if (m) return m[0].startsWith("#") ? m[0].replace(/\s/g, "") : `#${m[0]}`;
  }
  return null;
}

export type WiseAutoMatchResult = {
  matched: number;
  marked: number;
  matchedIds: string[];
};

export async function runWiseAutoMatch(admin: Admin): Promise<WiseAutoMatchResult> {
  const result: WiseAutoMatchResult = { matched: 0, marked: 0, matchedIds: [] };

  // 1. Unallocated payment emails, oldest first.
  const { data: payments, error: payErr } = await admin
    .from("wise_email_payments")
    .select("id,amount_cents,currency,sender_name,reference,subject,excerpt,matched_order_id")
    .is("matched_order_id", null)
    .order("received_at", { ascending: true })
    .limit(200);
  if (payErr || !payments?.length) return result;

  // 2. Orders awaiting a bank transfer payment (member and manual orders).
  type Awaiting = { orderId: string; reference: string; references: string[]; userId: string | null; amountCents: number };
  let awaiting: Awaiting[] = await listAwaitingBankOrders(admin);

  // Orders already tied to another payment stay out of the candidate list.
  if (awaiting.length) {
    const { data: takenRows } = await admin
      .from("wise_email_payments")
      .select("matched_order_id")
      .in("matched_order_id", awaiting.map((a) => a.orderId));
    const taken = new Set((takenRows ?? []).map((r: any) => String(r.matched_order_id)));
    awaiting = awaiting.filter((a) => !taken.has(a.orderId));
  }
  if (!awaiting.length) return result;

  // 3. Match each payment against exactly one order.
  for (const pay of payments as any[]) {
    if (String(pay.currency ?? "GBP") !== "GBP") continue;
    const hay = `${pay.reference ?? ""} ${pay.subject ?? ""} ${pay.excerpt ?? ""}`
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!hay) continue;
    const candidates = awaiting.filter(
      (a) => a.amountCents === Number(pay.amount_cents) && a.references.some((r) => { const n = normalizeCode(r); return n.length >= 6 && hay.includes(n); }),
    );
    if (candidates.length !== 1) continue;
    const order = candidates[0]!;

    // Atomic claim: only one payment ever lands on an order.
    const { data: claimed } = await admin
      .from("wise_email_payments")
      .update({ matched_order_id: order.orderId, auto_matched: true })
      .eq("id", pay.id)
      .is("matched_order_id", null)
      .select("id");
    if (!claimed?.length) continue;
    result.matched += 1;
    result.matchedIds.push(String(pay.id));
    awaiting = awaiting.filter((a) => a.orderId !== order.orderId);

    try {
      const transferNumber = extractTransferNumber(pay.reference, pay.subject, pay.excerpt);
      const { data: payRow } = await admin
        .from("order_payments")
        .select("id,provider_payment_id")
        .eq("order_id", order.orderId)
        .maybeSingle();
      const reference = transferNumber
        ?? (payRow?.provider_payment_id ? String(payRow.provider_payment_id) : order.reference);

      if (payRow?.id) {
        await admin
          .from("order_payments")
          .update({
            provider: "bank_transfer",
            status: "paid",
            ...(transferNumber ? { provider_payment_id: transferNumber } : {}),
          } as never)
          .eq("id", payRow.id);
      }

      const { error: rpcErr } = await admin.rpc("mark_order_paid" as never, {
        p_order_id: order.orderId,
        p_transaction_id: reference,
      } as never);
      if (rpcErr) {
        const { error: fallbackErr } = await admin
          .from("orders")
          .update({ paid_at: new Date().toISOString(), status: "paid" } as never)
          .eq("id", order.orderId);
        if (fallbackErr) throw fallbackErr;
      }
      result.marked += 1;

      // Same notices a manual confirmation produces.
      try {
        await postOrderPaymentReceivedNotice({
          orderId: order.orderId,
          provider: "Bank Transfer",
          reference,
          actorId: null,
        });
      } catch (e) {
        console.error("Auto-match payment notice failed:", e);
      }
      try {
        const message = await getAutomatedMessageServer(
          "order_bank_transfer_received",
          { total: `£${(order.amountCents / 100).toFixed(2)}` },
          `✅ Bank transfer received — your payment of £${(order.amountCents / 100).toFixed(2)} has landed in our account and your order is now marked as paid.`,
        );
        const { data: linkedTickets } = await admin
          .from("tickets")
          .select("id")
          .eq("order_id", order.orderId);
        if (linkedTickets?.length) {
          await admin.from("ticket_messages").insert(
            linkedTickets.map((t: { id: string }) => ({
              ticket_id: t.id,
              sender_id: order.userId,
              content: message,
            })) as never,
          );
        }
      } catch (e) {
        console.error("Auto-match bank transfer notice failed:", e);
      }

      // Silent staff-only note recording the automatic match.
      try {
        const { data: staffTickets } = await admin
          .from("tickets")
          .select("id")
          .eq("order_id", order.orderId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (staffTickets?.length) {
          const amount = (Number(pay.amount_cents) / 100).toFixed(2);
          await admin.from("ticket_messages").insert({
            ticket_id: staffTickets[0]!.id,
            sender_id: order.userId,
            content: `🤖 Automated staff note — @admin @management: a Wise payment of ${pay.currency ?? "GBP"} ${amount} from ${pay.sender_name ?? "Unknown sender"} (reference "${pay.reference ?? ""}") was auto-matched to this order by its payment reference and marked as received automatically.${transferNumber ? ` Wise transfer number: ${transferNumber}` : ""}`,
            is_internal: true,
          } as never);
        }
      } catch (e) {
        console.error("Auto-match staff note failed:", e);
      }

      // Staff bell notification.
      try {
        const amount = (Number(pay.amount_cents) / 100).toFixed(2);
        await admin.from("staff_notifications").insert({
          kind: "wise_payment",
          title: `Wise payment auto-marked as received: ${pay.currency ?? "GBP"} ${amount}`,
          body: `${pay.sender_name ?? "Unknown sender"} paid ${pay.currency ?? "GBP"} ${amount} — reference "${pay.reference ?? ""}" matched order ${order.reference} exactly, so it was marked as received automatically.`,
          link_path: "/admin?tab=bank-transfer-orders",
        });
      } catch (e) {
        console.error("Auto-match staff notification failed:", e);
      }
    } catch (e) {
      console.error("Auto-match settlement failed:", e);
    }
  }

  return result;
}
