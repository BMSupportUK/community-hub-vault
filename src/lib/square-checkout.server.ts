import { squarePaymentCompleted, squarePaymentMatches, squareFailureIsDefinitive, type SquarePayment } from './square-checkout-policy';
import { squareProcessingFee } from './profit-calculation';
import { squareRequest, syncProviderInvoice } from './provider-invoices.server';

export async function recordSquarePayment(db: any, payment: SquarePayment, locationId: string) {
  if (!payment.reference_id) throw new Error('Square payment has no order reference');
  const { data: order, error } = await db.from('orders').select('id,user_id,total_cents,paid_at,status').eq('id', payment.reference_id).maybeSingle();
  if (error || !order) throw new Error(error?.message || 'Order not found');
  if (!squarePaymentMatches(payment, order.id, order.total_cents, locationId)) throw new Error('Square payment does not match this order');
  const { data: existing, error: readError } = await db.from('order_payments').select('provider_payment_id,status').eq('order_id', order.id).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing?.status === 'COMPLETED' && existing.provider_payment_id !== payment.id) throw new Error('A different payment is already recorded');
  const { error: saveError } = await db.from('order_payments').upsert({
    order_id: order.id, provider: 'square', provider_payment_id: payment.id, square_payment_id: payment.id,
    status: payment.status, amount_cents: order.total_cents, currency: 'GBP',
    provider_fee_cents: squareProcessingFee(payment), card_brand: payment.card_details?.card?.card_brand ?? null,
    last_4: payment.card_details?.card?.last_4 ?? null, receipt_url: null, created_by: order.user_id,
  }, { onConflict: 'order_id' });
  if (saveError) throw new Error('Payment received by Square; confirmation is pending. Do not pay again.');
  const paid = squarePaymentCompleted(payment, order.id, order.total_cents, locationId);
  if (paid && !order.paid_at) {
    const { error: paidError } = await db.from('orders').update({ paid_at: new Date().toISOString(), ...(order.status !== 'completed' && order.status !== 'cancelled' ? { status: 'paid' } : {}) }).eq('id', order.id).is('paid_at', null);
    if (paidError) throw new Error('Payment received by Square; order confirmation is pending. Do not pay again.');
    const { postOrderPaymentReceivedNotice } = await import('./order-payment-notice.server');
    await postOrderPaymentReceivedNotice({ orderId: order.id, provider: 'Square', reference: payment.id, actorId: order.user_id });
  }
  if (paid) {
    const { error: clearError } = await db.from('order_checkout_links').update({ square_attempt_key: null }).eq('order_id', order.id);
    if (clearError) throw new Error(clearError.message);
  }
  return { paid, status: payment.status ?? 'PENDING' };
}

export async function syncSquareCheckout(db: any, orderId: string, locationId: string) {
  const { data: row, error } = await db.from('order_payments').select('provider,provider_payment_id').eq('order_id', orderId).maybeSingle();
  if (error) throw new Error(error.message);
  if (row?.provider === 'square' && row.provider_payment_id) {
    const payment = (await squareRequest(`/v2/payments/${encodeURIComponent(row.provider_payment_id)}`)).payment;
    return recordSquarePayment(db, payment, locationId);
  }
  const { data: link, error: linkError } = await db.from('order_checkout_links').select('square_attempt_key').eq('order_id', orderId).maybeSingle();
  if (linkError) throw new Error(linkError.message);
  if (!link?.square_attempt_key) return { paid: false, status: '' };
  let cursor = '';
  for (let page = 0; page < 3; page++) {
    const query = new URLSearchParams({ location_id: locationId, begin_time: new Date(Date.now() - 86400000).toISOString(), sort_order: 'DESC', limit: '100', ...(cursor ? { cursor } : {}) });
    const result = await squareRequest(`/v2/payments?${query}`);
    const payment = (result.payments ?? []).find((p: SquarePayment) => p.reference_id === orderId && ['COMPLETED', 'APPROVED', 'PENDING'].includes(p.status ?? ''));
    if (payment) return recordSquarePayment(db, payment, locationId);
    cursor = result.cursor ?? '';
    if (!cursor) break;
  }
  return { paid: false, status: 'CONFIRMATION_PENDING' };
}

export async function retireCheckoutInvoice(db: any, orderId: string) {
  const invoice = await syncProviderInvoice(db, orderId);
  if (!invoice) return;
  if (invoice.paid) throw new Error('This order is already paid');
  const status = invoice.status.toLowerCase();
  if (['payment_pending', 'partially_paid'].includes(status)) throw new Error('An invoice payment is already being processed. Do not pay again.');
  if (['canceled', 'cancelled', 'void', 'failed', 'refunded'].includes(status)) return;
  if (invoice.provider === 'square') {
    const cancelled = await squareRequest(`/v2/invoices/${encodeURIComponent(invoice.square_invoice_id)}/cancel`, { version: invoice.invoice.version });
    if (cancelled.invoice?.status !== 'CANCELED') throw new Error('Could not retire the old invoice. No card payment was taken.');
    const { error } = await db.from('order_invoices').update({ status: 'CANCELED', public_url: null, last_synced_at: new Date().toISOString() }).eq('order_id', orderId);
    if (error) throw new Error(error.message);
  } else {
    const { createStripeClient } = await import('./stripe.server');
    const env = process.env['STRIPE_ENVIRONMENT'] === 'live' ? 'live' : 'sandbox';
    const cancelled = await createStripeClient(env).invoices.voidInvoice(invoice.stripe_invoice_id);
    if (cancelled.status !== 'void') throw new Error('Could not retire the old invoice. No card payment was taken.');
    const { error } = await db.from('order_invoices').update({ status: 'void', public_url: null }).eq('order_id', orderId);
    if (error) throw new Error(error.message);
  }
}

export async function takeSquareCheckoutPayment(db: any, order: any, sourceId: string, token: string, locationId: string, environment: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${order.id}:${sourceId}`));
  const key = 'c' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  const { data: link, error: readError } = await db.from('order_checkout_links').select('square_attempt_key').eq('order_id', order.id).single();
  if (readError) throw new Error(readError.message);
  if (link.square_attempt_key && link.square_attempt_key !== key) throw new Error('An earlier card payment is awaiting confirmation. Do not pay again; check payment status.');
  const { error: saveError } = await db.from('order_checkout_links').update({ square_attempt_key: key }).eq('order_id', order.id);
  if (saveError) throw new Error(saveError.message);
  const base = environment === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  // Network/ambiguous failures keep the key; retrying this same token is safe.
  const response = await fetch(`${base}/v2/payments`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Square-Version': '2024-10-17' },
    body: JSON.stringify({ source_id: sourceId, idempotency_key: key, amount_money: { amount: order.total_cents, currency: 'GBP' }, location_id: locationId, reference_id: order.id, note: `BM Support order ${order.order_ref ?? order.id.slice(0,8)}`, autocomplete: true }),
  }).catch(() => { throw new Error('Square confirmation was interrupted. Do not enter another card; retry this payment or check its status.'); });
  const body = await response.json().catch(() => ({})) as { payment?: SquarePayment; errors?: { detail?: string; code?: string }[] };
  if (!response.ok) {
    if (squareFailureIsDefinitive(response.status)) {
      const { error } = await db.from('order_checkout_links').update({ square_attempt_key: null }).eq('order_id', order.id).eq('square_attempt_key', key);
      if (error) throw new Error(error.message);
    }
    throw new Error(`Square ${response.status}: ${body.errors?.[0]?.detail ?? body.errors?.[0]?.code ?? 'Payment confirmation unavailable. Do not pay again.'}`);
  }
  if (!body.payment?.id) throw new Error('Square confirmation is pending. Do not pay again.');
  return recordSquarePayment(db, body.payment, locationId);
}