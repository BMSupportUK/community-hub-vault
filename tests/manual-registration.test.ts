import { beforeAll, afterAll, test, expect } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { manualRegistrationSchema, requiresManualRegistration } from '../src/lib/manual-registration';
const db = new PGlite();
const orderId = '00000000-0000-0000-0000-000000000001';
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA private; CREATE SCHEMA auth;
    CREATE TYPE public.app_role AS ENUM('admin','management','staff');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE FUNCTION public.has_any_role(uuid,public.app_role[]) RETURNS boolean LANGUAGE sql AS 'SELECT current_setting(''test.role'',true)=ANY($2::text[])';
    CREATE TABLE private.orders(id uuid,customer_type text,status text);
    CREATE TABLE public.order_checkout_links(order_id uuid,claimed_by uuid);
    INSERT INTO private.orders VALUES('${orderId}','manual','completed');
    INSERT INTO public.order_checkout_links VALUES('${orderId}',NULL);`);
  await db.exec(readFileSync(new URL('../drizzle/migrations/0166_manual_order_registration_exception.sql', import.meta.url), 'utf8'));
});
afterAll(() => db.close());
test('manual orders require registration by default', async () => {
  const row = (await db.query<{ skip_registration: boolean }>('SELECT skip_registration FROM order_checkout_links')).rows[0];
  expect(row?.skip_registration).toBe(false);
  expect(requiresManualRegistration({ manual: true })).toBe(true);
});
test('admin can save and remove a manual registration exemption', async () => {
  await db.exec("SELECT set_config('test.role','admin',false)");
  await db.query('SELECT admin_set_manual_registration($1,true)', [orderId]);
  expect((await db.query<{ skip_registration: boolean }>('SELECT skip_registration FROM order_checkout_links')).rows[0]?.skip_registration).toBe(true);
  expect(requiresManualRegistration({ manual: true, skipRegistration: true })).toBe(false);
  await db.query('SELECT admin_set_manual_registration($1,false)', [orderId]);
  expect((await db.query<{ skip_registration: boolean }>('SELECT skip_registration FROM order_checkout_links')).rows[0]?.skip_registration).toBe(false);
});
test('staff and management cannot change registration through RPC or direct writes', async () => {
  for (const role of ['staff', 'management']) {
    await db.query("SELECT set_config('test.role',$1,false)", [role]);
    await expect(db.query('SELECT admin_set_manual_registration($1,true)', [orderId])).rejects.toThrow('Only admin');
    await expect(db.exec('UPDATE order_checkout_links SET skip_registration=true')).rejects.toThrow('Only admin');
  }
});
test('site orders cannot receive a manual registration exception', async () => {
  await db.exec("SELECT set_config('test.role','admin',false); UPDATE private.orders SET customer_type='site'");
  await expect(db.query('SELECT admin_set_manual_registration($1,true)', [orderId])).rejects.toThrow('Manual order not available');
  expect(requiresManualRegistration({ manual: false })).toBe(false);
});
test('account creation choice validates UUID and boolean inputs', () => {
  expect(manualRegistrationSchema.safeParse({ orderId, skip: true }).success).toBe(true);
  expect(manualRegistrationSchema.safeParse({ orderId, skip: 'true' }).success).toBe(false);
  expect(manualRegistrationSchema.safeParse({ orderId: 'bad', skip: true }).success).toBe(false);
});