import { afterAll, beforeAll, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const customer = '00000000-0000-0000-0000-000000000001';
const referrer = '00000000-0000-0000-0000-000000000002';
const admin = '00000000-0000-0000-0000-000000000003';
const order = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA private; CREATE SCHEMA auth;
    CREATE TYPE public.app_role AS ENUM ('admin','management','staff');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''test.user'',true),'''')::uuid';
    CREATE FUNCTION public.has_any_role(uuid,public.app_role[]) RETURNS boolean LANGUAGE sql AS 'SELECT coalesce(current_setting(''test.role'',true)=ANY($2::text[]),false)';
    CREATE FUNCTION private.app_decrypt(bytea) RETURNS text LANGUAGE sql AS 'SELECT convert_from($1,''UTF8'')';
    CREATE TABLE auth.users(id uuid, email text);
    CREATE TABLE public.profiles(id uuid,username text,display_name text);
    CREATE TABLE public.invites(id uuid,created_by uuid,used_by uuid,used_at timestamptz,created_at timestamptz);
    CREATE TABLE private.orders(id uuid,user_id uuid,customer_type text,email_enc bytea,order_ref text,shipping_name text,created_at timestamptz DEFAULT now(),total_cents int,discount_cents int DEFAULT 0,discount_code text,existing_username text,wants_adult_content boolean,manual_pay_method text,status text);
    CREATE TABLE public.order_checkout_links(order_id uuid,customer_kind text);
    CREATE TABLE public.order_items(id uuid,order_id uuid,product_name text,quantity int,unit_price_cents int);
  `);
  await db.exec(readFileSync(new URL('../drizzle/migrations/0146_order_referral_snapshots_and_staff_details.sql', import.meta.url), 'utf8'));
  await db.query('INSERT INTO auth.users VALUES($1,$2)', [customer, 'customer@example.test']);
  await db.query('INSERT INTO public.profiles VALUES($1,$2,$3)', [referrer, 'referrer-user', 'Referrer Name']);
  await db.query('INSERT INTO public.invites VALUES($1,$2,$3,now(),now())', [order(4), referrer, customer]);
});
afterAll(() => db.close());

async function insertSale(id: string, kind: string, owner = customer, adult: boolean | null = true) {
  await db.query(`INSERT INTO private.orders(id,user_id,customer_type,email_enc,total_cents,wants_adult_content,shipping_name,status,manual_pay_method)
    VALUES($1,$2,$3,convert_to('customer@example.test','UTF8'),6500,$4,'Customer','pending','square')`, [id, owner, kind, adult]);
}
async function readDetails(id: string, role: string) {
  await db.query("SELECT set_config('test.user',$1,false),set_config('test.role',$2,false)", [admin, role]);
  return (await db.query<{ details: Record<string, any> }>('SELECT public.staff_checkout_order_details($1) AS details', [id])).rows[0]?.details;
}

test('new referred sale saves the referrer name and does not change it when the profile changes', async () => {
  await insertSale(order(10), 'new');
  await db.query("UPDATE public.profiles SET display_name='Changed Name' WHERE id=$1", [referrer]);
  expect((await db.query('SELECT referrer_name FROM public.order_referrals WHERE order_id=$1', [order(10)])).rows).toEqual([{ referrer_name: 'Referrer Name' }]);
});
test('renewals and unreferred new sales do not acquire referral attribution', async () => {
  await insertSale(order(11), 'existing');
  await insertSale(order(12), 'new', admin);
  expect((await db.query('SELECT count(*)::int AS count FROM public.order_referrals WHERE order_id IN ($1,$2)', [order(11),order(12)])).rows[0]?.count).toBe(0);
});
test('manual new sale matches its customer email, not the staff creator, and manual renewals are excluded', async () => {
  await insertSale(order(13), 'manual', admin);
  await insertSale(order(14), 'manual', admin);
  await db.query('INSERT INTO public.order_checkout_links VALUES($1,\'new\'),($2,\'existing\')', [order(13),order(14)]);
  expect((await db.query('SELECT referrer_user_id FROM public.order_referrals WHERE order_id=$1', [order(13)])).rows).toEqual([{ referrer_user_id: referrer }]);
  expect((await db.query('SELECT count(*)::int AS count FROM public.order_referrals WHERE order_id=$1', [order(14)])).rows[0]?.count).toBe(0);
});
test('staff detail read preserves purchased items and adult choice, but does not disclose customer email', async () => {
  await insertSale(order(15), 'new', customer, false);
  await db.query('INSERT INTO public.order_items VALUES($1,$2,\'12 months\',1,6500)', [order(16),order(15)]);
  const details = await readDetails(order(15), 'staff');
  expect(details?.adultContent).toBe(false);
  expect(details?.email).toBeNull();
  expect(details?.items).toEqual([{name: '12 months', qty: 1, unitCents: 6500}]);
  expect(details?.referrerName).toBe('Changed Name');
});
test('admin and management receive the actual customer email and a yes adult choice', async () => {
  for (const role of ['admin','management']) {
    const details = await readDetails(order(10), role);
    expect(details?.email).toBe('customer@example.test');
    expect(details?.adultContent).toBe(true);
  }
});
test('non-staff cannot read secure customer order details', async () => {
  expect(readDetails(order(10), 'member')).rejects.toThrow('Forbidden');
});