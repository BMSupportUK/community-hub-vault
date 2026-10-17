import { expect, mock, test } from 'bun:test';

mock.module('../src/lib/stripe.server', () => ({ createStripeClient: () => ({}) }));
const { syncProviderInvoice } = await import('../src/lib/provider-invoices.server');

test('already-confirmed £115 Square sale saves missing payment and £4.61 fee without repeating confirmation', async () => {
  const priorFetch = globalThis.fetch;
  const priorToken = process.env.SQUARE_ACCESS_TOKEN;
  process.env.SQUARE_ACCESS_TOKEN = 'test-only';
  globalThis.fetch = mock(async (input: unknown) => {
    const path = new URL(String(input)).pathname;
    return Response.json(path.includes('/invoices/')
      ? { invoice: { id: 'inv:test', order_id: 'sq-order', status: 'PAID', public_url: 'https://example.com/invoice' } }
      : path.includes('/orders/')
        ? { order: { total_money: { amount: 11500, currency: 'GBP' }, tenders: [{ payment_id: 'sq-payment' }] } }
        : { payment: { id: 'sq-payment', order_id: 'sq-order', status: 'COMPLETED', amount_money: { amount: 11500, currency: 'GBP' }, processing_fee: [{ amount_money: { amount: 461, currency: 'GBP' } }] } });
  }) as typeof fetch;
  let recorded: Record<string, unknown> | null = null;
  let orderUpdates = 0;
  let inserts = 0;
  const db = { from: (table: string) => {
    const chain: any = {
      select: () => chain, eq: () => chain, is: () => chain,
      single: async () => ({ data: { id: 'sale', total_cents: 11500, paid_at: '2026-10-17', status: 'completed', user_id: null }, error: null }),
      maybeSingle: async () => ({ data: table === 'order_invoices' ? { square_invoice_id: 'inv:test' } : recorded, error: null }),
      update: () => { if (table === 'orders') orderUpdates++; return chain; },
      upsert: async (row: Record<string, unknown>) => { recorded = row; inserts++; return { error: null }; },
      then: (resolve: (v: unknown) => void) => resolve({ error: null }),
    };
    return chain;
  } };
  try {
    await syncProviderInvoice(db, 'sale');
    expect(recorded).toMatchObject({ order_id: 'sale', provider: 'square', amount_cents: 11500, provider_fee_cents: 461, provider_payment_id: 'sq-payment' });
    await syncProviderInvoice(db, 'sale');
    expect(inserts).toBe(1);
    expect(orderUpdates).toBe(0);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorToken === undefined) delete process.env.SQUARE_ACCESS_TOKEN;
    else process.env.SQUARE_ACCESS_TOKEN = priorToken;
  }
});