import { test, expect } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { historicalReferralBonusAdded, referralBonusExcluded } from '../src/lib/customer-referral-bonus';

test('DaneJ referrals are excluded even with spaces or different case', () => {
  expect(referralBonusExcluded('DaneJ')).toBe(true);
  expect(referralBonusExcluded('dane j')).toBe(true);
});
test('GJ referrals are excluded', () => {
  expect(referralBonusExcluded('GJ')).toBe(true);
  expect(referralBonusExcluded('G.J.')).toBe(true);
});
test('existing recorded referrals count as added without hiding a later qualifying sale', () => {
  expect(historicalReferralBonusAdded('bernies_quiff', 'bernies_quiff', 0)).toBe(true);
  expect(historicalReferralBonusAdded('bernies_quiff', 'bernies_quiff', 1)).toBe(false);
  expect(historicalReferralBonusAdded('DaneJ', 'DaneJ', 0)).toBe(false);
  expect(historicalReferralBonusAdded('new-referrer', undefined, 0)).toBe(false);
});
test('recording an existing bonus does not change subscription expiry and staff cannot read records', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE TYPE public.app_role AS ENUM ('admin','management','staff');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''00000000-0000-0000-0000-000000000001''::uuid';
      CREATE FUNCTION public.has_any_role(uuid,public.app_role[]) RETURNS boolean LANGUAGE sql AS 'SELECT coalesce(current_setting(''test.role'',true)=ANY($2::text[]),false)';
      CREATE TABLE public.test_expiry(id uuid,expiry_at timestamptz);
      INSERT INTO public.test_expiry VALUES('00000000-0000-0000-0000-000000000002','2027-12-25 09:02+00');`);
    await db.exec(readFileSync(new URL('../drizzle/migrations/0167_historical_referral_bonus_acknowledgements.sql', import.meta.url), 'utf8'));
    const before = (await db.query('SELECT * FROM public.test_expiry')).rows;
    await db.exec(`INSERT INTO public.referral_bonus_acknowledgements(customer_id,referrer_name) VALUES('00000000-0000-0000-0000-000000000002','bernies_quiff');`);
    expect((await db.query('SELECT * FROM public.test_expiry')).rows).toEqual(before);
    for (const role of ['admin','management','staff']) {
      await db.exec(`SELECT set_config('test.role','${role}',false); SET ROLE authenticated;`);
      expect((await db.query('SELECT * FROM public.referral_bonus_acknowledgements')).rows).toHaveLength(role === 'staff' ? 0 : 1);
      await db.exec('RESET ROLE;');
    }
  } finally { await db.close(); }
});