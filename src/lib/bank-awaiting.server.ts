import type { SupabaseClient } from "@supabase/supabase-js";

/** Legacy bank reference ("BM-XXXXXX") used by the old ticket flow. */
export function legacyBankReference(prefix: string, orderId: string) {
  const clean = (prefix || "BM").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "BM";
  const tail = orderId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${clean}-${tail}`;
}

/** The reference the secure checkout page tells the customer to use. */
export function checkoutReference(order: { id: string; order_ref?: string | null }) {
  return String(order.order_ref ?? String(order.id).slice(0, 8));
}

export type AwaitingBankOrder = {
  orderId: string;
  /** Reference shown to staff — the one the customer was told to use. */
  reference: string;
  /** Every reference that should match this order (checkout + legacy). */
  references: string[];
  userId: string | null;
  customerName: string | null;
  amountCents: number;
  hasPaymentRow: boolean;
};

/**
 * Every unpaid order waiting on a bank transfer: reported transfers, secure
 * checkout orders set to bank transfer (member AND manual orders — manual
 * orders have no account), and orders of customers holding a bank grant.
 */
export async function listAwaitingBankOrders(admin: SupabaseClient | any): Promise<AwaitingBankOrder[]> {
  const { data: detailsRow } = await admin
    .from("bank_transfer_details").select("reference_prefix").eq("singleton", true).maybeSingle();
  const prefix = String(detailsRow?.reference_prefix ?? "BM");

  const { data: payments } = await admin
    .from("order_payments")
    .select("order_id,provider_payment_id,amount_cents")
    .eq("provider", "bank_transfer")
    .eq("status", "awaiting_verification");
  const payByOrder = new Map<string, any>((payments ?? []).map((p: any) => [String(p.order_id), p]));

  const { data: grants } = await admin
    .from("bank_transfer_permissions").select("user_id,expires_at").is("revoked_at", null);
  const now = Date.now();
  const grantedUserIds = (grants ?? [])
    .filter((g: any) => !g.expires_at || new Date(g.expires_at).getTime() > now)
    .map((g: any) => String(g.user_id));

  const cols = "id,user_id,total_cents,order_ref,shipping_name,created_at";
  const batches: any[][] = [];
  if (payByOrder.size) {
    const { data } = await admin.from("orders").select(cols).in("id", Array.from(payByOrder.keys()))
      .is("paid_at", null).neq("status", "cancelled");
    batches.push(data ?? []);
  }
  {
    const { data } = await admin.from("orders").select(cols).eq("manual_pay_method", "wise")
      .is("paid_at", null).neq("status", "cancelled").order("created_at", { ascending: false }).limit(200);
    batches.push(data ?? []);
  }
  if (grantedUserIds.length) {
    const { data } = await admin.from("orders").select(cols).in("user_id", grantedUserIds)
      .is("paid_at", null).neq("status", "cancelled").order("created_at", { ascending: false }).limit(100);
    batches.push(data ?? []);
  }

  const seen = new Set<string>();
  const rows: AwaitingBankOrder[] = [];
  for (const o of batches.flat()) {
    const orderId = String(o.id);
    if (seen.has(orderId)) continue;
    seen.add(orderId);
    const pay = payByOrder.get(orderId);
    const reference = checkoutReference(o);
    const refs = new Set<string>([reference, legacyBankReference(prefix, orderId), legacyBankReference("BM", orderId)]);
    if (pay?.provider_payment_id) refs.add(String(pay.provider_payment_id));
    rows.push({
      orderId,
      reference,
      references: Array.from(refs),
      userId: o.user_id ? String(o.user_id) : null,
      customerName: (o.shipping_name as string | null) ?? null,
      amountCents: Number(pay?.amount_cents ?? o.total_cents ?? 0),
      hasPaymentRow: Boolean(pay),
    });
  }

  const userIds = Array.from(new Set(rows.map((r) => r.userId).filter(Boolean))) as string[];
  if (userIds.length) {
    const { data: profiles } = await admin.from("profiles").select("id,display_name").in("id", userIds);
    const names = new Map<string, string | null>((profiles ?? []).map((p: any) => [String(p.id), (p.display_name as string | null) ?? null]));
    for (const r of rows) if (!r.customerName && r.userId && names.get(r.userId)) r.customerName = names.get(r.userId) ?? r.customerName;
  }
  return rows;
}
