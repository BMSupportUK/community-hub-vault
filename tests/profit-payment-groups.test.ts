import { expect, test } from 'bun:test';
import { isOpenBankingSession, profitMethodTabs, profitPaymentGroup, settledProfitProvider, orderPaymentGroup, orderPaymentLabel } from '../src/lib/profit-payment-groups';
import { calculateProfit } from '../src/lib/profit-calculation';

test('Open Banking has its own group immediately before our Wise transfers', () => {
  const tabs = profitMethodTabs(['paypal']);
  expect(tabs.indexOf('open_banking')).toBe(tabs.indexOf('wise') - 1);
  expect(profitPaymentGroup('stripe', true)).toBe('open_banking');
  expect(profitPaymentGroup('stripe', false)).toBe('stripe');
  expect(profitPaymentGroup('bank_transfer', true)).toBe('wise');
});
test('only verified bank-only sessions or actual bank charges identify Open Banking', () => {
  expect(isOpenBankingSession({ payment_method_types: ['pay_by_bank'] })).toBe(true);
  expect(isOpenBankingSession({ payment_method_types: ['card', 'pay_by_bank'] })).toBe(false);
  expect(isOpenBankingSession({ payment_intent: { latest_charge: { payment_method_details: { type: 'pay_by_bank' } } } })).toBe(true);
  expect(isOpenBankingSession({ payment_method_types: ['pay_by_bank'], payment_intent: { latest_charge: { payment_method_details: { type: 'card' } } } })).toBe(false);
});
test('pending alternatives never decide a paid sale breakdown', () => {
  expect(settledProfitProvider([{ provider: 'stripe', status: 'PENDING' }, { provider: 'wise', status: 'paid' }])).toBe('wise');
});
test('Open Banking deducts its actual Stripe fee and unknown fees remain provisional', () => {
  const order = { total_cents: 6000, order_items: [{ product_id: 'p', product_name: 'Subscription', unit_price_cents: 6000, quantity: 1, unit_cost_cents: 2000 }], payments: [{ provider: 'stripe', status: 'COMPLETED', currency: 'GBP', provider_fee_cents: 50 }] };
  expect(calculateProfit(order).profit).toBe(3950);
  expect(calculateProfit({ ...order, payments: [{ ...order.payments[0], provider_fee_cents: null }] }).feesMissing).toBe(true);
});
test('Orders names the actual settled payment, not an abandoned bank attempt', () => {
  const pending = { provider: 'stripe', provider_payment_id: 'cs_bank', status: 'PENDING' };
  const verified = new Map([['cs_bank', true]]);
  for (const [provider, label] of [['square', 'Square card'], ['wise', 'Wise'], ['bank_transfer', 'Wise'], ['crypto', 'Crypto']]) {
    expect(orderPaymentLabel(orderPaymentGroup([pending, { provider, status: 'COMPLETED' }], verified, 'stripe'))).toBe(label);
  }
  expect(orderPaymentLabel(orderPaymentGroup([{ ...pending, status: 'COMPLETED' }], verified, 'wise'))).toBe('Open Banking');
});
test('unpaid method uses current saved choice and unverified Stripe is not guessed', () => {
  const payments = [{ provider: 'stripe', provider_payment_id: 'cs_bank', status: 'PENDING' }];
  expect(orderPaymentLabel(orderPaymentGroup(payments, new Map([['cs_bank', true]]), 'wise'))).toBe('Wise');
  expect(orderPaymentLabel(orderPaymentGroup(payments, new Map([['cs_bank', true]]), 'stripe'))).toBe('Open Banking');
  expect(orderPaymentLabel(orderPaymentGroup(payments, new Map(), 'stripe'))).toBe('Stripe · method unverified');
});