import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WiseIncoming } from "@/lib/wise.server";

/**
 * Owner-only view of incoming Wise transfers, matched against pending
 * bank-transfer orders. Read-only — confirming a payment still goes through
 * the existing confirmBankTransferReceived flow.
 */

export type WiseMatch = {
  orderId: string;
  reference: string;
  customerName: string | null;
  amountCents: number;
  exact: boolean; // amount matches as well as the reference
  kind: "reference" | "amount";
};

export type WiseRow = WiseIncoming & { match: WiseMatch | null; autoMatched?: boolean };

export type WiseFeed = {
  configured: boolean;
  error: string | null;
  authError: boolean;
  transactions: WiseRow[];
  forwardUrl: string | null;
  gmailConfirmation: {
    receivedAt: string;
    code: string | null;
    url: string | null;
  } | null;
  pending: Array<{
    orderId: string;
    reference: string;
    customerName: string | null;
    amountCents: number;
  }>;
};

export type PendingBankOrder = {
  orderId: string;
  reference: string;
  userId: string;
  amountCents: number;
  hasPaymentRow: boolean;
};

function normalizeCode(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function buildReference(prefix: string, orderId: string) {
  const clean = (prefix || "BM").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "BM";
  const tail = orderId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${clean}-${tail}`;
}

export const dismissGmailConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (!roleRows?.length) throw new Error("Only admin can dismiss this");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("email_forwarding_confirmations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    return { ok: true };
  });

export const revealWiseForwardUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ forwardUrl: string | null }> => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (!roleRows?.length) throw new Error("Only admin can view the Wise key");
    const claims = (context as any).claims ?? {};
    const amr = Array.isArray(claims.amr) ? claims.amr : [];
    const totp = amr.find((m: any) => m?.method === "totp");
    const fresh = totp?.timestamp && Date.now() / 1000 - totp.timestamp < 300;
    if (claims.aal !== "aal2" || !fresh) throw new Error("Enter your 2FA code to view the Wise key");
    const token = process.env.WISE_EMAIL_WEBHOOK_TOKEN;
    if (!token) return { forwardUrl: null };
    const origin = process.env.PUBLIC_SITE_URL || "https://bmsupport.uk";
    return { forwardUrl: `${origin}/api/public/wise-email?token=${token}` };
  });

/** Admin/management manually allocate a Wise payment to one order. */
export const allocateWisePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paymentId: string; orderId: string }) => {
    const uuid = /^[0-9a-f-]{36}$/i;
    if (!uuid.test(d?.paymentId ?? "") || !uuid.test(d?.orderId ?? "")) throw new Error("Invalid selection");
    return d;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "management"]);
    if (!roleRows?.length) throw new Error("Only admin or management can allocate payments");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pay } = await supabaseAdmin
      .from("wise_email_payments")
      .select("id,matched_order_id,amount_cents,currency,sender_name,reference")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!pay) throw new Error("Payment not found");
    if (pay.matched_order_id) throw new Error("This payment is already allocated to an order");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,user_id,paid_at,status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order || order.paid_at || order.status === "cancelled") throw new Error("That order is no longer awaiting payment");

    const { data: already } = await supabaseAdmin
      .from("wise_email_payments")
      .select("id")
      .eq("matched_order_id", data.orderId)
      .limit(1);
    if (already?.length) throw new Error("That order already has a payment allocated");

    const { error } = await supabaseAdmin
      .from("wise_email_payments")
      .update({ matched_order_id: data.orderId })
      .eq("id", data.paymentId)
      .is("matched_order_id", null);
    if (error) throw new Error("Could not save the allocation");

    // Silent staff-only note in the order's ticket.
    try {
      const { data: ticket } = await supabaseAdmin
        .from("tickets")
        .select("id")
        .eq("order_id", data.orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ticket) {
        const amount = (Number(pay.amount_cents) / 100).toFixed(2);
        await supabaseAdmin.from("ticket_messages").insert({
          ticket_id: ticket.id,
          sender_id: order.user_id,
          content: `🤖 Automated staff note — @admin @management: a Wise payment of ${pay.currency ?? "GBP"} ${amount} from ${pay.sender_name ?? "Unknown sender"} (reference "${pay.reference ?? ""}") has been allocated to this order. Approve it on the Bank Transfer page.`,
          is_internal: true,
        } as never);
      }
    } catch {
      // The allocation is saved even if the note fails.
    }
    return { ok: true };
  });

export const getWiseIncomingTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WiseFeed> => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "management"]);
    if (!roleRows?.length) throw new Error("Forbidden: owner only");
    const isAdmin = roleRows.some((r: any) => r.role === "admin");
    const feed: WiseFeed = { configured: false, error: null, authError: false, transactions: [], pending: [], forwardUrl: null, gmailConfirmation: null };
    const token = process.env.WISE_EMAIL_WEBHOOK_TOKEN;
    if (!token) return feed;
    feed.configured = true;
    // The key itself is never sent here; admins reveal it separately with 2FA.
    feed.forwardUrl = isAdmin ? "locked" : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Auto-match anything obvious before building the feed, so the list and
    // the awaiting sidebar reflect payments the system has already settled.
    try {
      const { runWiseAutoMatch } = await import("@/lib/wise-auto-match.server");
      await runWiseAutoMatch(supabaseAdmin);
    } catch (e) {
      console.error("Wise auto-match on feed load failed:", e);
    }

    const { data: confirmation } = await supabaseAdmin
      .from("email_forwarding_confirmations")
      .select("received_at,confirmation_code,confirmation_url")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (confirmation) {
      feed.gmailConfirmation = {
        receivedAt: confirmation.received_at,
        code: confirmation.confirmation_code,
        url: confirmation.confirmation_url,
      };
    }

    // Pending bank-transfer orders: explicit awaiting_verification rows, plus
    // unpaid orders for customers who hold a live bank-transfer grant.
    const pendingRows: PendingBankOrder[] = [];
    const seen = new Set<string>();

    const { data: payments } = await supabaseAdmin
      .from("order_payments")
      .select("order_id,provider_payment_id,amount_cents")
      .eq("provider", "bank_transfer")
      .eq("status", "awaiting_verification");

    const orderIds = (payments ?? []).map((p: any) => String(p.order_id));
    const orderRows: Array<{ id: string; user_id: string; total_cents: number }> = [];
    if (orderIds.length) {
      const { data } = await supabaseAdmin
        .from("orders")
        .select("id,user_id,total_cents")
        .in("id", orderIds)
        .is("paid_at", null)
        .neq("status", "cancelled");
      for (const o of data ?? []) orderRows.push(o as any);
    }
    for (const p of payments ?? []) {
      const orderId = String(p.order_id);
      if (seen.has(orderId)) continue;
      const order = orderRows.find((o) => o.id === orderId);
      if (!order) continue;
      seen.add(orderId);
      pendingRows.push({
        orderId,
        reference: String(p.provider_payment_id ?? buildReference("BM", orderId)),
        userId: String(order.user_id),
        amountCents: Number(p.amount_cents ?? order.total_cents ?? 0),
        hasPaymentRow: true,
      });
    }

    // Grants — customers currently allowed to pay by bank transfer.
    const { data: grants } = await supabaseAdmin
      .from("bank_transfer_permissions")
      .select("user_id,expires_at")
      .is("revoked_at", null);
    const now = Date.now();
    const grantedUserIds = (grants ?? [])
      .filter((g: any) => !g.expires_at || new Date(g.expires_at).getTime() > now)
      .map((g: any) => String(g.user_id));

    if (grantedUserIds.length) {
      const { data: unpaid } = await supabaseAdmin
        .from("orders")
        .select("id,user_id,total_cents")
        .in("user_id", grantedUserIds)
        .is("paid_at", null)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(100);
      const { data: detailsRow } = await supabaseAdmin
        .from("bank_transfer_details")
        .select("reference_prefix")
        .eq("singleton", true)
        .maybeSingle();
      const prefix = String(detailsRow?.reference_prefix ?? "BM");
      for (const o of unpaid ?? []) {
        const orderId = String(o.id);
        if (seen.has(orderId)) continue;
        seen.add(orderId);
        pendingRows.push({
          orderId,
          reference: buildReference(prefix, orderId),
          userId: String(o.user_id),
          amountCents: Number(o.total_cents ?? 0),
          hasPaymentRow: false,
        });
      }
    }

    // Customer names.
    const userIds = Array.from(new Set(pendingRows.map((p) => p.userId)));
    const names: Record<string, string> = {};
    if (userIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name")
        .in("id", userIds);
      for (const p of profiles ?? []) names[String(p.id)] = String(p.display_name ?? "Unknown");
    }

    feed.pending = pendingRows.map((p) => ({
      orderId: p.orderId,
      reference: p.reference,
      customerName: names[p.userId] ?? null,
      amountCents: p.amountCents,
    }));

    // Fetch Wise credits and match.
    try {
      const { data: emails, error: emailErr } = await supabaseAdmin
        .from("wise_email_payments")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(1000);
      if (emailErr) throw emailErr;
      const incoming: (WiseIncoming & { storedOrderId: string | null })[] = (emails ?? []).map((e: any) => ({
        id: String(e.id),
        date: e.received_at,
        senderName: e.sender_name,
        senderAccount: null,
        description: [e.subject, e.excerpt].join(" "),
        reference: e.reference ?? "",
        amountCents: Number(e.amount_cents),
        currency: e.currency ?? "GBP",
        autoMatched: Boolean(e.auto_matched),
        storedOrderId: e.matched_order_id ? String(e.matched_order_id) : null,
      }));

      // Orders stored on the payment rows — these keep their match even after
      // the order is paid and drops out of the pending list.
      const storedIds = Array.from(new Set(incoming.map((t) => t.storedOrderId).filter(Boolean))) as string[];
      const storedOrders: Record<string, { userId: string; amountCents: number }> = {};
      if (storedIds.length) {
        const { data: sOrders } = await supabaseAdmin
          .from("orders")
          .select("id,user_id,total_cents")
          .in("id", storedIds);
        const sUserIds = Array.from(new Set((sOrders ?? []).map((o: any) => String(o.user_id))));
        const { data: sProfiles } = sUserIds.length
          ? await supabaseAdmin.from("profiles").select("id,display_name").in("id", sUserIds)
          : { data: [] as any[] };
        for (const p of sProfiles ?? []) names[String(p.id)] = String(p.display_name ?? "Unknown");
        for (const o of sOrders ?? []) {
          storedOrders[String(o.id)] = { userId: String(o.user_id), amountCents: Number(o.total_cents ?? 0) };
        }
      }
      // Only manual allocations count — no automatic matching.
      feed.transactions = incoming.map((t) => {
        let match: WiseMatch | null = null;
        if (t.storedOrderId && storedOrders[t.storedOrderId]) {
          const o = storedOrders[t.storedOrderId];
          match = {
            orderId: t.storedOrderId,
            reference: t.reference,
            customerName: names[o.userId] ?? null,
            amountCents: o.amountCents,
            exact: true,
            kind: "reference",
          };
        }
        return { ...t, match };
      });
    } catch (e) {
      feed.error = e instanceof Error ? e.message : "Could not load payments";
    }

    return feed;
  });
