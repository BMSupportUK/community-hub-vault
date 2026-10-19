import { expect, mock, test } from 'bun:test';

const orders = Array.from({ length: 6 }, (_, index) => ({
  id: `order-${index}`, user_id: null, total_cents: 6000,
  status: 'pending', created_at: new Date().toISOString(),
}));
const writes: Record<string, unknown>[] = [];
const paid: string[] = [];
const notices: string[] = [];
const lookups: string[] = [];
const db = {
  rpc: async (_name: string, args: { p_order_id: string }) => { paid.push(args.p_order_id); return { error: null }; },
  from: (table: string) => {
    let orderId = '';
    const chain = {
      select: () => chain, is: () => chain, gte: () => chain, order: () => chain,
      eq: (column: string, value: string) => { if (column === 'order_id') orderId = value; return chain; },
      limit: async () => ({ data: orders, error: null }),
      maybeSingle: async () => ({ data: { provider: 'stripe', provider_payment_id: `cs_live_${orderId}`, status: 'PENDING' }, error: null }),
      upsert: async (row: Record<string, unknown>) => { if (table === 'order_payments') writes.push(row); return { error: null }; },
    };
    return chain;
  },
};
mock.module('../src/integrations/supabase/client.server', () => ({ supabaseAdmin: db }));
mock.module('../src/lib/provider-invoices.server', () => ({ syncProviderInvoice: async () => null }));
mock.module('../src/lib/order-payment-notice.server', () => ({ postOrderPaymentReceivedNotice: async (args: { orderId: string }) => { notices.push(args.orderId); } }));
mock.module('../src/lib/stripe.server', () => ({ createStripeClient: (environment: string) => ({
  checkout: { sessions: { retrieve: async (id: string) => {
    lookups.push(`${environment}:${id}`);
    if (environment !== 'live') throw { code: 'resource_missing' };
    return { id, amount_total: id.endsWith('order-1') ? 5999 : 6000,
      payment_status: id.endsWith('order-2') ? 'unpaid' : 'paid', payment_intent: { id: `pi_${id}` } };
  } } },
}) }));
const { reconcileUnpaidOrders } = await import('../src/lib/order-payment-reconcile.server');

test('cron confirms live sessions despite sandbox config, keeps amount/unpaid guards and five-session budget', async () => {
  const previous = process.env.STRIPE_ENVIRONMENT;
  process.env.STRIPE_ENVIRONMENT = 'sandbox';
  try {
    const result = await reconcileUnpaidOrders();
    expect(result).toEqual({ scanned: 6, repaired: 3, stripeChecked: 5 });
    expect(lookups).toEqual(orders.slice(0, 5).map((order) => `live:cs_live_${order.id}`));
    expect(paid).toEqual(['order-0', 'order-3', 'order-4']);
    expect(notices).toEqual(paid);
    expect(writes.map((row) => row.order_id)).toEqual(paid);
    expect(writes[0]).toMatchObject({ provider: 'stripe', status: 'COMPLETED', amount_cents: 6000, currency: 'GBP' });
  } finally {
    if (previous === undefined) delete process.env.STRIPE_ENVIRONMENT;
    else process.env.STRIPE_ENVIRONMENT = previous;
  }
});