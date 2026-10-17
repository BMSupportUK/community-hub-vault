import { expect, test } from 'bun:test';
import { allocateOrderAmounts, calculateProfit, squareProcessingFee } from '../src/lib/profit-calculation';

const order = { total_cents: 6500, order_items: [{ product_id: 'p', product_name: '12 months', unit_price_cents: 6500, quantity: 1, unit_cost_cents: 2000 }], payments: [{ provider: 'square', status: 'COMPLETED', currency: 'GBP', provider_fee_cents: 150 }] };
test('net profit deducts product costs and provider fees separately', () => {
  expect(calculateProfit(order)).toEqual({ revenue: 6500, cost: 2000, fees: 150, feesMissing: false, missing: false, profit: 4350 });
});
test('an unknown provider fee leaves profit provisional rather than confirmed zero', () => {
  expect(calculateProfit({ ...order, payments: [{ ...order.payments[0], provider_fee_cents: null }] }).missing).toBe(true);
});
test('pending payments and foreign-currency fees cannot deduct GBP fees', () => {
  expect(calculateProfit({ ...order, payments: [{ ...order.payments[0], status: 'PENDING' }] }).fees).toBe(0);
  expect(calculateProfit({ ...order, payments: [{ ...order.payments[0], currency: 'USD' }] }).feesMissing).toBe(true);
});
test('package allocations preserve discounted revenue and fees exactly once', () => {
  const result = allocateOrderAmounts({ ...order, total_cents: 5001, order_items: [...order.order_items, { ...order.order_items[0], product_id: 'p2' }] });
  expect(result.revenue).toEqual([2500, 2501]);
  expect(result.fees).toEqual([75, 75]);
});
test('Square fees use actual GBP processing fees, not a rate estimate', () => {
  expect(squareProcessingFee({ processing_fee: [{ amount_money: { amount: 100, currency: 'GBP' } }, { amount_money: { amount: 50, currency: 'GBP' } }] })).toBe(150);
  expect(squareProcessingFee({})).toBeNull();
  expect(squareProcessingFee({ processing_fee: [{ amount_money: { amount: 100, currency: 'USD' } }] })).toBeNull();
});
test('cash requires a recorded zero fee rather than assuming one', () => {
  expect(calculateProfit({ ...order, payments: [{ ...order.payments[0], provider: 'cash', provider_fee_cents: null }] }).feesMissing).toBe(true);
  expect(calculateProfit({ ...order, payments: [{ ...order.payments[0], provider: 'cash', provider_fee_cents: 0 }] }).profit).toBe(4500);
});
test('orders without items retain their totals as unattributed and costs provisional', () => {
  const empty = { ...order, order_items: [] };
  expect(calculateProfit(empty).missing).toBe(true);
  expect(allocateOrderAmounts(empty).unattributedRevenue).toBe(6500);
  expect(allocateOrderAmounts(empty).unattributedFees).toBe(150);
});