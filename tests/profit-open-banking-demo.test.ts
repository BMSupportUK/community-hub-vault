import { expect, test } from 'bun:test';
import { OPEN_BANKING_DEMO, profitDisplayOrders } from '../src/lib/profit-open-banking-demo';
import { calculateProfit } from '../src/lib/profit-calculation';
test('£1 demo deducts its explicitly sample fee', () => {
  const result = calculateProfit(OPEN_BANKING_DEMO);
  expect(result.revenue).toBe(100);
  expect(result.fees).toBe(21);
  expect(result.profit).toBe(79);
});
test('demo display never changes live totals', () => {
  const live = [{ ...OPEN_BANKING_DEMO, id: 'real-order', total_cents: 6000 }];
  expect(profitDisplayOrders(live, true).map(o => o.id)).toEqual(['demo-open-banking']);
  expect(profitDisplayOrders(live, false)).toBe(live);
  expect(live[0].total_cents).toBe(6000);
});
