import { expect, test } from 'bun:test';
import { staffOrderNotificationLink } from '../src/lib/order-notification-link';

const order = '3de3a26b-03d5-4f5f-bd2a-e87eded4f9d8';
test('new and manual staff order alerts open the exact secure checkout', () => {
  expect(staffOrderNotificationLink('order_placed', order)).toBe(`/admin-secure-page?order=${order}`);
  expect(staffOrderNotificationLink('manual_order', order)).toBe(`/admin-secure-page?order=${order}`);
});
test('non-order alerts and missing or invalid IDs do not redirect to checkout', () => {
  expect(staffOrderNotificationLink('ticket_raised', order)).toBeNull();
  expect(staffOrderNotificationLink('order_placed', null)).toBeNull();
  expect(staffOrderNotificationLink('order_placed', 'bad&id=other')).toBeNull();
});