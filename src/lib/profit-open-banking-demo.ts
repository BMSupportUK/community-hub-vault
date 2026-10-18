import type { ProfitOrder } from './profit-calculation';
// Display-only fixture; never persist as a real payment.
export const OPEN_BANKING_DEMO = {
  id: 'demo-open-banking', status: 'paid', total_cents: 100,
  created_at: '2026-10-18T18:29:00Z',
  shipping_name: 'DEMO Customer (test) · Open Banking', existing_username: null,
  order_items: [{ product_id: null, product_name: 'DEMO £1 checkout', unit_price_cents: 100, quantity: 1, unit_cost_cents: 0 }],
  payments: [{ provider: 'stripe', status: 'COMPLETED', currency: 'GBP', provider_fee_cents: 21 }],
} satisfies ProfitOrder & { id: string; status: string; created_at: string; shipping_name: string; existing_username: null };
export function profitDisplayOrders<T>(live: T[], demo: boolean): T[] | (typeof OPEN_BANKING_DEMO)[] {
  return demo ? [OPEN_BANKING_DEMO] : live;
}
