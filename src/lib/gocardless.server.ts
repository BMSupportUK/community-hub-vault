import { goCardlessFeeFromPayoutItems, isGoCardlessPaid, pickGoCardlessEnv, resolvePayByBankProvider, PAY_BY_BANK_PROVIDER_KEY, type GoCardlessEnv, type PayByBankProvider } from "@/lib/gocardless";

/** GoCardless Instant Bank Pay (Billing Requests). Server only. */
export function goCardlessEnv(): GoCardlessEnv | null {
  return pickGoCardlessEnv(!!process.env.GOCARDLESS_ACCESS_TOKEN_LIVE, !!process.env.GOCARDLESS_ACCESS_TOKEN_SANDBOX);
}

async function gc(path: string, init: RequestInit = {}) {
  const env = goCardlessEnv();
  if (!env) throw new Error("GoCardless is not set up yet");
  const token = env === "live" ? process.env.GOCARDLESS_ACCESS_TOKEN_LIVE : process.env.GOCARDLESS_ACCESS_TOKEN_SANDBOX;
  const base = env === "live" ? "https://api.gocardless.com" : "https://api-sandbox.gocardless.com";
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "GoCardless-Version": "2015-07-06", "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[gocardless]", path, res.status, body?.error?.message);
    throw new Error(body?.error?.message || "GoCardless request failed");
  }
  return body;
}

export async function getPayByBankProvider(supabaseAdmin: any): Promise<PayByBankProvider> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", PAY_BY_BANK_PROVIDER_KEY).maybeSingle();
  return resolvePayByBankProvider(data?.value, !!goCardlessEnv());
}

export async function createGoCardlessBankFlow(order: { id: string; order_ref: string | null; total_cents: number }, returnUrl: string) {
  const ref = order.order_ref ?? String(order.id).slice(0, 8);
  const br = await gc("/billing_requests", {
    method: "POST",
    body: JSON.stringify({ billing_requests: { payment_request: { amount: order.total_cents, currency: "GBP", description: `Order ${ref}`, scheme: "faster_payments", metadata: { order_id: String(order.id) } }, metadata: { order_id: String(order.id) } } }),
  });
  const id = br.billing_requests.id as string;
  const flow = await gc("/billing_request_flows", {
    method: "POST",
    body: JSON.stringify({ billing_request_flows: { redirect_uri: returnUrl, exit_uri: returnUrl, links: { billing_request: id } } }),
  });
  return { billingRequestId: id, url: flow.billing_request_flows.authorisation_url as string };
}

async function markOrderPaid(supabaseAdmin: any, orderId: string, paymentId: string, amount: number) {
  const { data: order } = await supabaseAdmin.from("orders").select("id,total_cents,paid_at,status").eq("id", orderId).maybeSingle();
  if (!order || order.paid_at) return false;
  if (Number(order.total_cents) !== amount) { console.error(`[gocardless] amount mismatch on order ${orderId}`); return false; }
  await supabaseAdmin.from("order_payments").update({ status: "COMPLETED", provider_payment_id: paymentId }).eq("order_id", orderId);
  const patch: Record<string, string> = { paid_at: new Date().toISOString() };
  if (order.status !== "completed" && order.status !== "cancelled") patch.status = "paid";
  await supabaseAdmin.from("orders").update(patch).eq("id", orderId).is("paid_at", null);
  try {
    const { postOrderPaymentReceivedNotice } = await import("@/lib/order-payment-notice.server");
    await postOrderPaymentReceivedNotice({ orderId, provider: "Open Banking", reference: paymentId } as any);
  } catch { /* best effort */ }
  return true;
}

/** Re-check one GoCardless payment and apply its status/fee to the order. */
export async function syncGoCardlessPayment(supabaseAdmin: any, paymentId: string, payoutId?: string | null) {
  const p = (await gc(`/payments/${encodeURIComponent(paymentId)}`)).payments;
  const orderId = p?.metadata?.order_id;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return;
  const { data: row } = await supabaseAdmin.from("order_payments").select("provider").eq("order_id", orderId).maybeSingle();
  if (row?.provider !== "gocardless") return;
  if (["failed", "cancelled", "customer_approval_denied", "charged_back"].includes(p.status)) {
    await supabaseAdmin.from("order_payments").update({ status: "FAILED", provider_payment_id: paymentId }).eq("order_id", orderId);
    return;
  }
  if (isGoCardlessPaid(p.status)) await markOrderPaid(supabaseAdmin, orderId, paymentId, Number(p.amount));
  const payout = payoutId ?? p.links?.payout;
  if (payout) {
    const items = (await gc(`/payout_items?payout=${encodeURIComponent(payout)}&limit=500`)).payout_items ?? [];
    await supabaseAdmin.from("order_payments").update({ provider_fee_cents: goCardlessFeeFromPayoutItems(items, paymentId) }).eq("order_id", orderId);
  }
}

/** Reconcile path: billing request → its payment, then sync. */
export async function syncGoCardlessOrder(supabaseAdmin: any, orderId: string) {
  const { data: row } = await supabaseAdmin.from("order_payments").select("provider,provider_payment_id").eq("order_id", orderId).maybeSingle();
  if (row?.provider !== "gocardless" || !row.provider_payment_id) return;
  let paymentId = String(row.provider_payment_id);
  if (paymentId.startsWith("BRQ")) {
    const br = (await gc(`/billing_requests/${encodeURIComponent(paymentId)}`)).billing_requests;
    paymentId = br?.links?.payment_request_payment ?? "";
    if (!paymentId) return;
  }
  await syncGoCardlessPayment(supabaseAdmin, paymentId);
}

export async function verifyGoCardlessSignature(body: string, signature: string | null) {
  const secret = process.env.GOCARDLESS_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
