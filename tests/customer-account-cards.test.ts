import { expect, test } from 'bun:test';
import { customerAccountCards } from '../src/lib/customer-account-cards';

const customers = [
  { userId: 'owner-a', accounts: [{ id: 'a1' }, { id: 'a2' }] },
  { userId: 'owner-b', accounts: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }] },
];

test('Multiple accounts has exactly one card per account', () => {
  expect(customerAccountCards(customers, true).map((card) => card.accountId)).toEqual(['a1', 'a2', 'b1', 'b2', 'b3']);
});
test('cards managed by the same owner remain adjacent in the chosen customer order', () => {
  expect(customerAccountCards([...customers].reverse(), true).map((card) => card.customer.userId)).toEqual(['owner-b', 'owner-b', 'owner-b', 'owner-a', 'owner-a']);
});
test('other tabs retain one customer card with all accounts', () => {
  expect(customerAccountCards(customers, false).map((card) => card.accountId)).toEqual([null, null]);
});