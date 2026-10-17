import { effectiveCardProvider, squareInvoiceChatMessage } from './payment-methods';
import { createStripeClient, type StripeEnv } from '@/lib/stripe.server';
import { invoiceCanBeReused, invoiceIsSettled } from '@/lib/provider-invoice-policy';

type Provider = 'square' | 'stripe';
export async function squareRequest(path: string, payload?: unknown) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error('Square payments are not configured');
  const base = process.env.SQUARE_ENVIRONMENT === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  const response = await fetch(base + path, {
    method: payload ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Square-Version': '2024-10-17' },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await response.json() as any;
  if (!response.ok) throw new Error(result.errors?.[0]?.detail ?? 'Square invoice request failed');
  return result;
}

export async function syncProviderInvoice(db: any, orderId: string, environment?: StripeEnv) {
  const { data: row, error } = await db.from('order_invoices').select('*').eq('order_id', orderId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const { data: order } = await db.from('orders').select('id,user_id,total_cents,paid_at,status').eq('id', orderId).single();
  if (!order) throw new Error('Order not found');
  let invoice: any;
  let provider: Provider;
  let squarePaymentId: string | null = null;
  let status: string, url: string | null, total: number, paid: number, currency: string;
  if (row.stripe_invoice_id) {
    provider = 'stripe';
    const primary = environment ?? (process.env.STRIPE_ENVIRONMENT === 'live' ? 'live' : 'sandbox');
    try { invoice = await createStripeClient(primary).invoices.retrieve(row.stripe_invoice_id); }
    catch (error) {
      if (environment) throw error;
      invoice = await createStripeClient(primary === 'live' ? 'sandbox' : 'live').invoices.retrieve(row.stripe_invoice_id);
    }
    status = invoice.status ?? ''; url = invoice.hosted_invoice_url; total = invoice.total; paid = invoice.amount_paid; currency = invoice.currency;
  } else if (row.square_invoice_id) {
    provider = 'square';
    invoice = (await squareRequest(`/v2/invoices/${encodeURIComponent(row.square_invoice_id)}`)).invoice;
    const sqOrder = (await squareRequest(`/v2/orders/${encodeURIComponent(invoice.order_id)}`)).order;
    status = invoice.status ?? ''; url = invoice.public_url;
    total = Number(sqOrder.total_money?.amount ?? -1); currency = sqOrder.total_money?.currency ?? '';
    paid = 0;
    for (const tender of sqOrder.tenders ?? []) {
      if (!tender.payment_id) continue;
      const payment = (await squareRequest(`/v2/payments/${encodeURIComponent(tender.payment_id)}`)).payment;
      if (payment.status !== 'COMPLETED') continue;
      if (payment.order_id !== invoice.order_id || payment.amount_money?.currency !== 'GBP') throw new Error('Square payment does not match this invoice');
      paid += Number(payment.amount_money?.amount ?? 0);
      squarePaymentId = payment.id;
    }
  } else return null;
  const settled = invoiceIsSettled(status, total, paid, currency, Number(order.total_cents));
  if (status.toLowerCase() === 'paid' && !settled) throw new Error('Invoice payment amount does not match the order');
  const { error: updateError } = await db.from('order_invoices').update({ status, public_url: url, ...(settled ? { paid_at: new Date().toISOString() } : {}), last_synced_at: new Date().toISOString() }).eq('order_id', orderId);
  if (updateError) throw new Error(updateError.message);
  if (settled && !order.paid_at) {
    const reference = invoice.id;
    const { error: paymentError } = await db.from('order_payments').upsert({ order_id: orderId, provider, provider_payment_id: squarePaymentId ?? reference, square_payment_id: squarePaymentId, status: 'COMPLETED', amount_cents: total, currency: 'GBP', created_by: order.user_id, receipt_url: null }, { onConflict: 'order_id' });
    if (paymentError) throw new Error(paymentError.message);
    if (!order.paid_at) {
      const { error: paidError } = await db.from('orders').update({ paid_at: new Date().toISOString(), ...(order.status !== 'cancelled' && order.status !== 'completed' ? { status: 'paid' } : {}) }).eq('id', orderId).is('paid_at', null);
      if (paidError) throw new Error(paidError.message);
      const { postOrderPaymentReceivedNotice } = await import('@/lib/order-payment-notice.server');
      await postOrderPaymentReceivedNotice({ orderId, provider: provider === 'square' ? 'Square' : 'Stripe', reference, actorId: order.user_id });
    }
  }
  return { ...row, status, public_url: url, amount_cents: total, provider, paid: settled, invoice };
}

export async function createProviderInvoice(db: any, orderId: string, requestedProvider: Provider, environment: StripeEnv, actorId: string | null) {
  const provider = effectiveCardProvider(requestedProvider) as Provider;
  const { data: locked, error: lockError } = await db.rpc('claim_checkout_payment_lock', { p_order: orderId, p_seconds: 90 });
  if (lockError) throw new Error(lockError.message);
  if (!locked) throw new Error('Payment is being prepared. Please try again in a moment.');
  try {
    const existing = await syncProviderInvoice(db, orderId);
    const { data: order, error } = await db.from('orders').select('id,user_id,total_cents,shipping_name,email,paid_at,status').eq('id', orderId).single();
    if (error || !order) throw new Error('Order not found');
    if (order.paid_at || existing?.paid) throw new Error('This order is already paid');
    if (order.status === 'cancelled') throw new Error('This order was cancelled');
    if (!Number.isSafeInteger(order.total_cents) || !(order.total_cents > 0)) throw new Error('Order total must be a positive amount');
    const { data: payment } = await db.from('order_payments').select('provider,status').eq('order_id', orderId).maybeSingle();
    const { data: link } = await db.from('order_checkout_links').select('payment_sent_at').eq('order_id', orderId).maybeSingle();
    if (link?.payment_sent_at || (payment?.provider === 'nowpayments' && ['waiting','confirming','confirmed','sending','partially_paid'].includes(String(payment.status).toLowerCase()))) throw new Error('Another payment is being processed for this order.');
    if (['completed','approved','finished'].includes(String(payment?.status).toLowerCase())) throw new Error('A payment has already been taken.');
    if (existing && existing.provider === provider && invoiceCanBeReused(existing.status, existing.amount_cents, order.total_cents, existing.public_url)) return { public_url: existing.public_url, status: existing.status };
    if (existing && ['payment_pending','partially_paid'].includes(existing.status.toLowerCase())) throw new Error('An invoice payment is already being processed.');
    // Keep the customer's existing payable link rather than switching providers
    // and potentially exposing two invoices for the same order.
    if (existing && invoiceCanBeReused(existing.status, existing.amount_cents, order.total_cents, existing.public_url)) return { public_url: existing.public_url, status: existing.status };
    if (existing && invoiceCanBeReused(existing.status, existing.amount_cents, existing.amount_cents, existing.public_url)) {
      if (existing.provider === 'square') await squareRequest(`/v2/invoices/${existing.square_invoice_id}/cancel`, { version: existing.invoice.version });
      else await createStripeClient(environment).invoices.voidInvoice(existing.stripe_invoice_id);
    }
    // Retire any old embedded Stripe session before exposing a new invoice.
    const { data: oldPayment } = await db.from('order_payments').select('provider,provider_payment_id').eq('order_id', orderId).maybeSingle();
    if (oldPayment?.provider === 'stripe' && String(oldPayment.provider_payment_id).startsWith('cs_')) {
      const stripe = createStripeClient(environment);
      const session = await stripe.checkout.sessions.retrieve(oldPayment.provider_payment_id);
      if (session.payment_status === 'paid') throw new Error('A Stripe payment has already been taken.');
      if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
    }
    const key = crypto.randomUUID();
    let row: any;
    if (provider === 'stripe') {
      const stripe = createStripeClient(environment);
      const customer = await stripe.customers.create({ ...(order.email ? { email: order.email } : {}), name: order.shipping_name || 'Customer', metadata: { order_id: orderId } }, { idempotencyKey: `${key}-customer` });
      const draft = await stripe.invoices.create({ customer: customer.id, collection_method: 'send_invoice', days_until_due: 30, auto_advance: false, payment_settings: { payment_method_types: ['card'] }, metadata: { order_id: orderId }, description: `BM Support order #${orderId.slice(0,8)}` }, { idempotencyKey: `${key}-invoice` });
      if (!draft.id) throw new Error('Stripe did not create an invoice');
      await stripe.invoiceItems.create({ customer: customer.id, invoice: draft.id, currency: 'gbp', amount: order.total_cents, description: `BM Support order #${orderId.slice(0,8)}` }, { idempotencyKey: `${key}-item` });
      const invoice = await stripe.invoices.finalizeInvoice(draft.id, { auto_advance: false }, { idempotencyKey: `${key}-finalize` });
      if (invoice.total !== order.total_cents || invoice.currency !== 'gbp' || !invoice.hosted_invoice_url) {
        if (invoice.status === 'open') await stripe.invoices.voidInvoice(invoice.id);
        throw new Error('Stripe invoice total does not match the order');
      }
      row = { stripe_invoice_id: invoice.id, square_invoice_id: null, square_order_id: null, public_url: invoice.hosted_invoice_url, invoice_number: invoice.number, status: invoice.status };
    } else {
      const locationId = process.env.SQUARE_LOCATION_ID;
      if (!locationId) throw new Error('Square location is not configured');
      // Square needs a recipient email. Demo orders use the demo inbox;
      // real orders use only the customer's own email (order, then account).
      const isDemo = /\bdemo\b/i.test(order.shipping_name || '');
      let payerEmail: string | null = isDemo ? 'bmsupport2022@protonmail.com' : (order.email || null);
      if (!payerEmail && order.user_id) {
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
          const { data } = await supabaseAdmin.auth.admin.getUserById(order.user_id);
          payerEmail = data?.user?.email || null;
        } catch { /* no account email */ }
      }
      if (!payerEmail) throw new Error("This order has no customer email — add the customer's email to the order before sending a Square invoice.");
      const customer = (await squareRequest('/v2/customers', { idempotency_key: key, given_name: order.shipping_name || 'Customer', email_address: payerEmail })).customer;
      const sqOrder = (await squareRequest('/v2/orders', { idempotency_key: key, order: { location_id: locationId, customer_id: customer.id, reference_id: orderId, line_items: [{ name: `BM Support order #${orderId.slice(0,8)}`, quantity: '1', base_price_money: { amount: order.total_cents, currency: 'GBP' } }] } })).order;
      const draft = (await squareRequest('/v2/invoices', { idempotency_key: key, invoice: { location_id: locationId, order_id: sqOrder.id, primary_recipient: { customer_id: customer.id }, payment_requests: [{ request_type: 'BALANCE', due_date: new Date(Date.now()+30*86400000).toISOString().slice(0,10) }], delivery_method: 'SHARE_MANUALLY', accepted_payment_methods: { card: true, square_gift_card: false, bank_account: false, buy_now_pay_later: false }, title: `BM Support order #${orderId.slice(0,8)}` } })).invoice;
      const invoice = (await squareRequest(`/v2/invoices/${draft.id}/publish`, { version: draft.version, idempotency_key: key })).invoice;
      if (!invoice.public_url) throw new Error('Square invoice has no payment link');
      row = { square_invoice_id: invoice.id, square_order_id: sqOrder.id, stripe_invoice_id: null, public_url: invoice.public_url, invoice_number: invoice.invoice_number, status: invoice.status };
    }
    const { error: saveError } = await db.from('order_invoices').upsert({ ...row, order_id: orderId, amount_cents: order.total_cents, currency: 'GBP', created_by: actorId, last_synced_at: new Date().toISOString() }, { onConflict: 'order_id' });
    if (saveError) {
      // Never leave an untracked payable invoice after a failed local save.
      if (provider === 'stripe') await createStripeClient(environment).invoices.voidInvoice(row.stripe_invoice_id);
      else {
        const current = (await squareRequest(`/v2/invoices/${row.square_invoice_id}`)).invoice;
        await squareRequest(`/v2/invoices/${row.square_invoice_id}/cancel`, { version: current.version });
      }
      throw new Error(saveError.message);
    }
    if (provider === 'square') {
      // Post the new invoice link into the order's secure checkout chat (once per new invoice).
      const { error: chatError } = await db.from('checkout_chat_messages').insert({ order_id: orderId, sender: 'staff', staff_id: actorId, content: squareInvoiceChatMessage(order.total_cents, String(row.public_url)) });
      if (chatError) console.error('Square invoice chat post failed', chatError.message);
    }
    return { public_url: String(row.public_url), status: String(row.status) };
  } finally { await db.rpc('release_checkout_payment_lock', { p_order: orderId }); }
}
