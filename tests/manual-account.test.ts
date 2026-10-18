import { expect, test } from 'bun:test';
import { manualAccountFieldsSchema, manualAccountSignupSchema, canCreateManualAccount } from '../src/lib/manual-account-schema';
const fields = { username: 'customer_1', displayName: 'Customer One', gender: 'male', pin: '123456' };
test('username is required independently of display name', () => {
  expect(manualAccountFieldsSchema.safeParse({ ...fields, username: '' }).success).toBe(false);
  expect(manualAccountFieldsSchema.safeParse(fields).success).toBe(true);
});
test('display name is required', () => { expect(manualAccountFieldsSchema.safeParse({ ...fields, displayName: '  ' }).success).toBe(false); });
test('male or female must be selected explicitly', () => {
  for (const gender of ['', undefined, 'other']) expect(manualAccountFieldsSchema.safeParse({ ...fields, gender }).success).toBe(false);
  expect(manualAccountFieldsSchema.safeParse({ ...fields, gender: 'female' }).success).toBe(true);
});
test('credentials PIN must contain exactly six digits', () => {
  for (const pin of ['', '12345', '1234567', 'abcdef']) expect(manualAccountFieldsSchema.safeParse({ ...fields, pin }).success).toBe(false);
});
test('registration is the last paid completed manual order step and respects bypass', () => {
  const order = { manual: true, paidAt: '2026-10-18', completedAt: '2026-10-18' };
  expect(canCreateManualAccount(order)).toBe(true);
  for (const change of [{ paidAt: null }, { completedAt: null }, { cancelled: true }, { manual: false }, { skipRegistration: true }]) expect(canCreateManualAccount({ ...order, ...change })).toBe(false);
});
test('server signup rejects incomplete and additional inputs', () => {
  const input = { ...fields, token: 'a'.repeat(64), password: 'order-password', sitePassword: 'PrivatePassword123' };
  expect(manualAccountSignupSchema.safeParse(input).success).toBe(true);
  expect(manualAccountSignupSchema.safeParse({ ...input, sitePassword: '' }).success).toBe(false);
  expect(manualAccountSignupSchema.safeParse({ ...input, role: 'admin' }).success).toBe(false);
});