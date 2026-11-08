import { expect, mock, test } from 'bun:test';
mock.module('../src/lib/provider-invoices.server', () => ({ squareRequest: async () => ({}), syncProviderInvoice: async () => null }));
mock.module('../src/lib/order-payment-notice.server', () => ({ postOrderPaymentReceivedNotice: async () => ({ posted: true }) }));
const { takeSquareCheckoutPayment } = await import('../src/lib/square-checkout.server');
test('£65 card charge retries use the same key and completed payment records paid', async () => {
 const previousFetch = globalThis.fetch;
 let key: string | null = null;
 let paid = false;
 const requests: any[] = [];
 const db = { from: (table: string) => {
  let patch: any;
  const chain: any = { select: () => chain, eq: () => chain, is: () => chain,
   single: async () => ({ data: { square_attempt_key: key }, error: null }),
   maybeSingle: async () => ({ data: table === 'orders' ? { id: 'order-1', total_cents: 6500, status: 'pending', paid_at: null, user_id: null } : null, error: null }),
   update: (p: any) => { patch = p; return chain; },
   then: (resolve: any) => { if (table === 'order_checkout_links') key = patch.square_attempt_key; if (table === 'orders') paid = !!patch.paid_at; resolve({ error: null }); },
   upsert: async () => ({ error: null }),
  }; return chain;
 } };
 globalThis.fetch = mock(async (_input: any, init: any) => {
  const body = JSON.parse(init.body); requests.push(body);
  if (requests.length === 1) throw new Error('network interrupted');
  return Response.json({ payment: { id: 'pay-1', reference_id: 'order-1', location_id: 'location-1', amount_money: { amount: 6500, currency: 'GBP' }, status: 'COMPLETED' } });
 }) as typeof fetch;
 try {
  const args = [db, { id: 'order-1', total_cents: 6500 }, 'one-use-card-token', 'test-secret', 'location-1', 'sandbox'] as const;
  await expect(takeSquareCheckoutPayment(...args)).rejects.toThrow('interrupted');
  expect(key).not.toBeNull(); expect(paid).toBe(false);
  const result = await takeSquareCheckoutPayment(...args);
  expect(requests[0].idempotency_key).toBe(requests[1].idempotency_key);
  expect(requests[1].amount_money).toEqual({ amount: 6500, currency: 'GBP' });
  expect(result.paid).toBe(true); expect(paid).toBe(true); expect(key).toBeNull();
 } finally { globalThis.fetch = previousFetch; }
});