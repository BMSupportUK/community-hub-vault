import { describe, expect, test } from 'bun:test';
import { squarePaymentCompleted, squareFailureIsDefinitive } from '../src/lib/square-checkout-policy';
const payment = { id: 'payment-1', status: 'COMPLETED', reference_id: 'order-1', location_id: 'location-1', amount_money: { amount: 6500, currency: 'GBP' } };
describe('Square on-site payment confirmation', () => {
  test('confirmed £65 payment updates only its matching order', () => {
    expect(squarePaymentCompleted(payment, 'order-1', 6500, 'location-1')).toBe(true);
    expect(squarePaymentCompleted(payment, 'order-2', 6500, 'location-1')).toBe(false);
  });
  test('authorisation alone never marks paid', () => {
    expect(squarePaymentCompleted({ ...payment, status: 'APPROVED' }, 'order-1', 6500, 'location-1')).toBe(false);
  });
  test('wrong amount, currency and location never mark paid', () => {
    expect(squarePaymentCompleted(payment, 'order-1', 6400, 'location-1')).toBe(false);
    expect(squarePaymentCompleted({ ...payment, amount_money: { amount: 6500, currency: 'USD' } }, 'order-1', 6500, 'location-1')).toBe(false);
    expect(squarePaymentCompleted(payment, 'order-1', 6500, 'location-2')).toBe(false);
  });
  test('ambiguous provider failures retain duplicate-charge protection', () => {
    for (const status of [408,409,429,500,503]) expect(squareFailureIsDefinitive(status)).toBe(false);
    expect(squareFailureIsDefinitive(400)).toBe(true);
    expect(squareFailureIsDefinitive(402)).toBe(true);
  });
});