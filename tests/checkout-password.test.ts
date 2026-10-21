import { expect, mock, test } from 'bun:test';

let link: { password: string; claimed_by: string | null } | null = null;
mock.module('../src/integrations/supabase/client.server', () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: link }) }) }) }) },
}));
const { unlock } = await import('../src/lib/checkout.server');

test('signed-in shop order owners require their correct order password', async () => {
  link = { password: 'ABCD-EFGH-IJKL', claimed_by: 'placing-member' };
  expect(await unlock('token', '')).toBeNull();
  expect(await unlock('token', 'wrong-password')).toBeNull();
  expect(await unlock('token', 'ABCD-EFGH-IJKL')).not.toBeNull();
});
test('manual orders require their correct order password', async () => {
  link = { password: 'ABCD-EFGH-IJKL', claimed_by: null };
  expect(await unlock('token', '')).toBeNull();
  expect(await unlock('token', 'wrong-password')).toBeNull();
  expect(await unlock('token', ' abcd-efgh-ijkl ')).not.toBeNull();
});
test('unknown orders cannot be unlocked', async () => {
  link = null;
  expect(await unlock('missing', 'ABCD-EFGH-IJKL')).toBeNull();
});