import { describe, expect, test } from 'bun:test';
import { invoiceCanBeReused, invoiceIsSettled } from '../src/lib/provider-invoice-policy';

describe('provider invoice payments', () => {
 test('reuse existing payable invoices rather than expiring the payment page', () => {
  expect(invoiceCanBeReused('UNPAID',6500,6500,'https://squareup.com/pay/invoice')).toBe(true);
  expect(invoiceCanBeReused('open',6500,6500,'https://invoice.stripe.com/example')).toBe(true);
  expect(invoiceCanBeReused('cancelled',6500,6500,'https://squareup.com/pay/invoice')).toBe(false);
  expect(invoiceCanBeReused('void',6500,6500,'https://invoice.stripe.com/example')).toBe(false);
 });
 test('only reuse invoices for the actual order total', () => {
  expect(invoiceCanBeReused('open',6400,6500,'https://invoice.stripe.com/example')).toBe(false);
  expect(invoiceCanBeReused('open',6500,6500,null)).toBe(false);
 });
 test('confirm only provider-verified full GBP settlement', () => {
  expect(invoiceIsSettled('PAID',6500,6500,'GBP',6500)).toBe(true);
  expect(invoiceIsSettled('open',6500,6500,'GBP',6500)).toBe(false);
  expect(invoiceIsSettled('PAID',6500,6499,'GBP',6500)).toBe(false);
  expect(invoiceIsSettled('paid',6500,6500,'USD',6500)).toBe(false);
  expect(invoiceIsSettled('paid',6400,6500,'GBP',6500)).toBe(false);
  expect(invoiceIsSettled('paid',6500,6501,'GBP',6500)).toBe(false);
  expect(invoiceIsSettled('paid',6500.5,6500.5,'GBP',6500.5)).toBe(false);
 });
});