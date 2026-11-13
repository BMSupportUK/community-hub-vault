import { expect, test } from 'bun:test';
import { manualCustomerInput, saveManualCustomer } from '../src/lib/manual-customer-onboarding';

test('adding a named manual customer with email stores only a contact, not an account or email send', async () => {
  const inserts: unknown[] = [];
  const admin = {
    auth: { admin: { createUser: () => { throw new Error('Must not create a website account'); } } },
    from(table: string) {
      expect(table).toBe('manual_name_customers');
      return { insert(row: unknown) { inserts.push(row); return { select() { return { single: async () => ({ data: { id: 'manual-1' }, error: null }) }; } }; } };
    },
  };
  const result = await saveManualCustomer(admin, 'staff-1', { name: 'Manual Customer', email: 'Customer@Example.com' });
  expect(inserts).toEqual([{ name: 'Manual Customer', email: 'customer@example.com', created_by: 'staff-1' }]);
  expect(result).toEqual({ userId: 'manual-1', sent: false, banned: false, nameOnly: true });
});

test('name-only manual customers remain allowed without email', async () => {
  let contact: unknown;
  const admin = { from: () => ({ insert: (row: unknown) => { contact = row; return { select: () => ({ single: async () => ({ data: { id: 'manual-2' }, error: null }) }) }; } }) };
  await saveManualCustomer(admin, 'staff-1', { name: 'Name Only', email: '' });
  expect(contact).toEqual({ name: 'Name Only', email: null, created_by: 'staff-1' });
});

test('existing manual customers can save their current expiry without creating an order or account', async () => {
  let contact: any;
  const admin = { from: (table: string) => {
    expect(table).toBe('manual_name_customers');
    return { insert: (row: unknown) => { contact = row; return { select: () => ({ single: async () => ({ data: { id: 'existing-1' }, error: null }) }) }; } };
  } };
  await saveManualCustomer(admin, 'staff-1', { name: 'Existing Customer', existingCustomer: true, expiryDate: '2027-03-15' });
  expect(contact.subscription_expiry_date).toBe('2027-03-15');
});

test('new manual customers do not get a stale existing-customer expiry', async () => {
  let contact: any;
  const admin = { from: () => ({ insert: (row: unknown) => { contact = row; return { select: () => ({ single: async () => ({ data: { id: 'new-1' }, error: null }) }) }; } }) };
  await saveManualCustomer(admin, 'staff-1', { name: 'New Customer', existingCustomer: false, expiryDate: '2027-03-15' });
  expect(contact.subscription_expiry_date).toBeUndefined();
});

test('manual expiry is optional and invalid calendar dates are rejected', () => {
  expect(manualCustomerInput.safeParse({ name: 'Existing Customer', existingCustomer: true, expiryDate: '' }).success).toBe(true);
  expect(manualCustomerInput.safeParse({ name: 'Existing Customer', existingCustomer: true, expiryDate: '2027-02-30' }).success).toBe(false);
});