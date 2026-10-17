import { expect, test } from 'bun:test';
import { calculateProfit } from '../src/lib/profit-calculation';
const pay = (provider: string, fee: number | null) => ({ provider, status: 'COMPLETED', currency: 'GBP', provider_fee_cents: fee });
test('cash and bank transfer have no provider fee', () => {
  for (const p of ['cash', 'bank_transfer']) {
    const r = calculateProfit({ total_cents: 6500, order_items: [], payments: [pay(p, null)] });
    expect(r.feesMissing).toBe(false); expect(r.fees).toBe(0);
  }
});
test('square without recorded fee stays unknown', () => {
  expect(calculateProfit({ total_cents: 6500, order_items: [], payments: [pay('square', null)] }).feesMissing).toBe(true);
});
