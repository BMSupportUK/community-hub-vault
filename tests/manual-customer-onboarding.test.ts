import { expect, test } from 'bun:test';
import { saveManualCustomer } from '../src/lib/manual-customer-onboarding';

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