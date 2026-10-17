import { beforeAll, afterAll, test, expect } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { manualAccessRequestSchema, manualAccessLoginSchema } from '../src/lib/manual-credentials-schema';
const db = new PGlite();
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA private; CREATE SCHEMA auth;
  CREATE TYPE public.app_role AS ENUM('admin','management','staff');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
  CREATE FUNCTION public.has_any_role(uuid,public.app_role[]) RETURNS boolean LANGUAGE sql AS 'SELECT current_setting(''test.role'',true)=ANY($2::text[])';
  CREATE FUNCTION public.admin_customer_subscription_list() RETURNS jsonb LANGUAGE sql AS 'SELECT ''[]''::jsonb';
  CREATE FUNCTION private.app_decrypt(bytea) RETURNS text LANGUAGE sql AS 'SELECT convert_from($1,''UTF8'')';
  CREATE TABLE private.orders(id uuid,customer_type text,order_ref text,paid_at timestamptz,status text,email_enc bytea,shipping_name text);
  CREATE TABLE public.order_checkout_links(order_id uuid,renewal_account_id uuid,subscription_expiry_at timestamptz);
  CREATE TABLE private.pending_order_credentials(order_id uuid,app_login_name text,password_enc bytea,expiry_at timestamptz,account_type text);
  CREATE TABLE private.app_credentials(order_id uuid,app_login_name text,password_enc bytea,expiry_at timestamptz,account_type text,created_at timestamptz);
  INSERT INTO private.orders VALUES('${id(1)}','manual','MANUAL-1',now(),'completed',convert_to('one@example.test','UTF8'),'First'),('${id(2)}','manual','MANUAL-2',now(),'completed',convert_to('two@example.test','UTF8'),'Second'),('${id(3)}','site','SITE-3',now(),'completed',convert_to('one@example.test','UTF8'),'Site'),('${id(4)}','manual','MANUAL-4',NULL,'pending',convert_to('one@example.test','UTF8'),'Unpaid');
  INSERT INTO private.pending_order_credentials VALUES('${id(1)}','first-login',convert_to('synthetic-first-password','UTF8'),'2027-01-01','single'),('${id(2)}','second-login',convert_to('synthetic-second-password','UTF8'),'2027-02-01','multi');`);
  await db.exec(readFileSync(new URL('../drizzle/migrations/0163_manual_credentials_secure_access.sql', import.meta.url), 'utf8'));
});
afterAll(() => db.close());
test('manual customer sees only their paid manual credentials, never site or unrelated orders', async () => {
  const rows = (await db.query<{ rows: any[] }>('SELECT manual_credentials_for_email($1) rows', [' ONE@EXAMPLE.TEST '])).rows[0]?.rows;
  expect(rows?.map(r => r.id)).toEqual([id(1)]);
  expect(rows?.[0]?.login).toBe('first-login');
  expect(rows?.[0]?.password === 'synthetic-first-password').toBe(true);
});
test('renewal retrieves its explicitly linked original account', async () => {
  await db.exec(`INSERT INTO private.orders VALUES('${id(5)}','manual','MANUAL-5',now(),'completed',convert_to('renewal@example.test','UTF8'),'Renewal'); INSERT INTO public.order_checkout_links VALUES('${id(5)}','${id(1)}',NULL);`);
  expect((await db.query<{ rows: any[] }>('SELECT manual_credentials_for_email($1) rows', ['renewal@example.test'])).rows[0]?.rows.map(r => r.id)).toEqual([id(1)]);
});
test('secure password works once and creates an expiring session', async () => {
  await db.exec("INSERT INTO manual_credential_access(email_key,code_hash,code_expires_at) VALUES('one','correct',now()+interval '15 minutes')");
  expect((await db.query<{ ok: boolean }>("SELECT manual_credentials_verify('one','correct','session') ok")).rows[0]?.ok).toBe(true);
  expect((await db.query<{ ok: boolean }>("SELECT manual_credentials_verify('one','correct','other') ok")).rows[0]?.ok).toBe(false);
  expect((await db.query<{ ok: boolean }>("SELECT session_expires_at>now() AND session_expires_at<=now()+interval '30 minutes' ok FROM manual_credential_access WHERE email_key='one'")).rows[0]?.ok).toBe(true);
});
test('expired password is rejected', async () => {
  await db.exec("INSERT INTO manual_credential_access(email_key,code_hash,code_expires_at) VALUES('expired','correct',now()-interval '1 second')");
  expect((await db.query<{ ok: boolean }>("SELECT manual_credentials_verify('expired','correct','s') ok")).rows[0]?.ok).toBe(false);
});
test('five incorrect password attempts lock that request', async () => {
  await db.exec("INSERT INTO manual_credential_access(email_key,code_hash,code_expires_at) VALUES('locked','correct',now()+interval '15 minutes')");
  for (let i = 0; i < 5; i++) await db.query("SELECT manual_credentials_verify('locked','wrong','s')");
  expect((await db.query<{ ok: boolean }>("SELECT manual_credentials_verify('locked','correct','s') ok")).rows[0]?.ok).toBe(false);
});
test('email requests are limited to three per hour', async () => {
  for (let i = 0; i < 3; i++) expect((await db.query<{ ok: boolean }>("SELECT manual_credentials_throttle('email:limited',3) ok")).rows[0]?.ok).toBe(true);
  expect((await db.query<{ ok: boolean }>("SELECT manual_credentials_throttle('email:limited',3) ok")).rows[0]?.ok).toBe(false);
});
test('customer cannot directly call service-only credential reads', async () => {
  expect((await db.query<{ allowed: boolean }>("SELECT has_function_privilege('authenticated','manual_credentials_for_email(text)','EXECUTE') allowed")).rows[0]?.allowed).toBe(false);
  await db.exec("SELECT set_config('test.role','staff',false)");
  await expect(db.query('SELECT admin_manual_credentials()')).rejects.toThrow('Forbidden');
});
test('manual access validates email and secure password inputs', () => {
  expect(manualAccessRequestSchema.safeParse({ email: 'not-email' }).success).toBe(false);
  expect(manualAccessLoginSchema.safeParse({ email: 'one@example.test', password: 'short' }).success).toBe(false);
});