import { expect, test } from 'bun:test';
import { lookupAcrossStripeEnvironments, stripePaymentEnvironments } from '../src/lib/stripe-payment-lookup';
test('live sessions use live even when configured for sandbox', async () => {
  const visited: string[] = [];
  const session = await lookupAcrossStripeEnvironments('cs_live_paid', 'sandbox', async (environment) => {
    visited.push(environment);
    if (environment !== 'live') throw { code: 'resource_missing' };
    return { payment_status: 'paid', amount_total: 6000 };
  });
  expect(visited).toEqual(['live']);
  expect(session).toEqual({ payment_status: 'paid', amount_total: 6000 });
});
test('test sessions use sandbox even when configured for live', () => {
  expect(stripePaymentEnvironments('cs_test_paid', 'live')).toEqual(['sandbox', 'live']);
});
test('missing invoice retries the other account', async () => {
  const visited: string[] = [];
  const result = await lookupAcrossStripeEnvironments('in_paid', 'sandbox', async (environment) => {
    visited.push(environment);
    if (environment === 'sandbox') throw { raw: { code: 'resource_missing' } };
    return { status: 'paid' };
  });
  expect(visited).toEqual(['sandbox', 'live']);
  expect(result.status).toBe('paid');
});
test('empty metadata search checks both accounts', async () => {
  const visited: string[] = [];
  const result = await lookupAcrossStripeEnvironments(null, 'sandbox', async (environment) => {
    visited.push(environment);
    return { data: environment === 'live' ? [{ id: 'pi_paid', amount: 6000 }] : [] };
  }, (result) => result.data.some((payment) => payment.amount === 6000));
  expect(visited).toEqual(['sandbox', 'live']);
  expect(result.data[0]?.id).toBe('pi_paid');
});
test('non-missing API errors do not trigger another account lookup', async () => {
  const visited: string[] = [];
  await expect(lookupAcrossStripeEnvironments('cs_live_paid', 'sandbox', async (environment) => {
    visited.push(environment); throw new Error('Network unavailable');
  })).rejects.toThrow('Network unavailable');
  expect(visited).toEqual(['live']);
});
test('unpaid session stays unpaid without searching another account', async () => {
  const visited: string[] = [];
  const result = await lookupAcrossStripeEnvironments('cs_live_pending', 'sandbox', async (environment) => {
    visited.push(environment); return { payment_status: 'unpaid' };
  });
  expect(result.payment_status).toBe('unpaid');
  expect(visited).toEqual(['live']);
});
