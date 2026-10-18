import { expect, test } from 'bun:test';
import { customerListGroup } from '../src/lib/customer-list-group';

test('manually added accounts awaiting required fields appear in Manual customers before any purchase', () => {
  expect(customerListGroup({ hasSiteAccount: true, manualSetupPending: true, accounts: [] })).toBe('manual');
});
test('completing required fields automatically puts the same account in its site group', () => {
  const customer = { hasSiteAccount: true, manualSetupPending: true, accounts: [{ id: 'login-1', expiresAt: '2027-10-18' }] };
  expect(customerListGroup(customer)).toBe('manual');
  expect(customerListGroup({ ...customer, manualSetupPending: false })).toBe('single');
  expect(customer.accounts[0].expiresAt).toBe('2027-10-18');
});
test('completed multi-login site accounts stay separate from manual-order customers', () => {
  expect(customerListGroup({ hasSiteAccount: true, manualSetupPending: false, accounts: [1, 2] })).toBe('multi');
  expect(customerListGroup({ hasSiteAccount: false, accounts: [1, 2] })).toBe('manual');
});