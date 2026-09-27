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

export type WiseRow = WiseIncoming & { match: WiseMatch | null };

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

export const getWiseIncomingTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WiseFeed> => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "management"]);
    if (!roleRows?.length) throw new Error("Forbidden: owner only");
    const feed: WiseFeed = { configured: false, error: null, authError: false, transactions: [], pending: [], forwardUrl: null, gmailConfirmation: null };
    const token = process.env.WISE_EMAIL_WEBHOOK_TOKEN;
    if (!token) return feed;
    feed.configured = true;
    const origin = process.env.PUBLIC_SITE_URL || "https://bmsupport.uk";
    feed.forwardUrl = `${origin}/api/public/wise-email?token=${token}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
      const since = new Date(Date.now() - 14 * 86400_000).toISOString();
      const { data: emails, error: emailErr } = await supabaseAdmin
        .from("wise_email_payments")
        .select("*")
        .gte("received_at", since)
        .order("received_at", { ascending: false })
        .limit(100);
      if (emailErr) throw emailErr;
      const incoming: WiseIncoming[] = (emails ?? []).map((e: any) => ({
        id: String(e.id),
        date: e.received_at,
        senderName: e.sender_name,
        senderAccount: null,
        description: [e.subject, e.excerpt].join(" "),
        reference: e.reference ?? "",
        amountCents: Number(e.amount_cents),
        currency: e.currency ?? "GBP",
      }));
      const pendingByCode = new Map<string, { p: PendingBankOrder; reference: string }>();
      for (const p of pendingRows) {
        const code = normalizeCode(p.reference);
        if (code.length >= 5) pendingByCode.set(code, { p, reference: p.reference });
      }

      feed.transactions = incoming.map((t) => {
        const haystack = normalizeCode([t.reference, t.description, t.senderName ?? ""].join(" "));
        let match: WiseMatch | null = null;
        for (const [code, { p, reference }] of pendingByCode) {
          if (!haystack.includes(code)) continue;
          const exact = Math.abs(t.amountCents - p.amountCents) <= 1;
          match = {
            orderId: p.orderId,
            reference,
            customerName: names[p.userId] ?? null,
            amountCents: p.amountCents,
            exact,
            kind: "reference",
          };
          break;
        }
        if (!match) {
          const amountMatch = pendingRows.find((p) => Math.abs(t.amountCents - p.amountCents) <= 1);
          if (amountMatch) {
            match = {
              orderId: amountMatch.orderId,
              reference: amountMatch.reference,
              customerName: names[amountMatch.userId] ?? null,
              amountCents: amountMatch.amountCents,
              exact: true,
              kind: "amount",
            };
          }
        }
        return { ...t, match };
      });
    } catch (e) {
      feed.error = e instanceof Error ? e.message : "Could not load payments";
    }

    return feed;
  });
