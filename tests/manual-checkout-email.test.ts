import { beforeAll, afterAll, test, expect } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
beforeAll(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE TYPE public.app_role AS ENUM ('admin','management','staff');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''${id(1)}''::uuid';
    CREATE FUNCTION public.has_any_role(uuid,public.app_role[]) RETURNS boolean LANGUAGE sql AS 'SELECT current_setting(''test.role'',true)=ANY($2::text[])';
    CREATE FUNCTION public.app_encrypt(text) RETURNS bytea LANGUAGE sql AS 'SELECT convert_to($1,''UTF8'')';
    CREATE FUNCTION private.app_decrypt(bytea) RETURNS text LANGUAGE sql AS 'SELECT convert_from($1,''UTF8'')';
    CREATE TABLE public.profiles(id uuid);
    CREATE TABLE public.manual_name_customers(id uuid,name text,email text);
    CREATE TABLE private.orders(id uuid PRIMARY KEY,customer_type text,order_ref text,status text,paid_at timestamptz,created_at timestamptz DEFAULT now(),shipping_name text,email_enc bytea);
    CREATE TABLE public.order_checkout_links(order_id uuid PRIMARY KEY,token text,password text,claimed_by uuid,renewal_customer_id uuid,renewal_account_id uuid,renewal_applied_at timestamptz);
    CREATE FUNCTION public.admin_customer_subscription_list() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_agg(jsonb_build_object('userId',id,'hasSiteAccount',false)) FROM (SELECT id FROM manual_name_customers UNION SELECT id FROM private.orders) c$$;
    SELECT set_config('test.role','admin',false);
    INSERT INTO manual_name_customers VALUES('${id(2)}','Customer','customer@example.com');
    INSERT INTO private.orders(id,customer_type,order_ref,status,shipping_name,email_enc) VALUES('${id(3)}','manual','MANUAL-595281','pending','Customer',app_encrypt('original@example.com'));
    INSERT INTO order_checkout_links VALUES('${id(3)}','checkout-token','order-password',NULL,'${id(2)}',NULL,NULL);`);
  await db.exec(readFileSync(new URL('../drizzle/migrations/0353_manual_checkout_email_payment_guards.sql', import.meta.url), 'utf8'));
});
afterAll(() => db.close());

test('prepares MANUAL-595281 using the saved contact and encrypted order email without marking it paid', async () => {
  const result = await db.query<{details: any}>('SELECT admin_manual_customer_checkout_email($1,$2) details', [id(2),id(3)]);
  expect(result.rows[0]?.details).toEqual({email:'customer@example.com',name:'Customer',ref:'MANUAL-595281',token:'checkout-token',password:'order-password'});
  expect((await db.query('SELECT status,paid_at,private.app_decrypt(email_enc) email FROM private.orders WHERE id=$1',[id(3)])).rows[0]).toEqual({status:'pending',paid_at:null,email:'customer@example.com'});
});

test('paid orders disappear from the picker and cannot be emailed even if payment happens after selection', async () => {
  expect((await db.query<{options:any[]}>('SELECT admin_manual_customer_checkout_options($1) options',[id(2)])).rows[0]?.options.map(o=>o.ref)).toContain('MANUAL-595281');
  for (const [status,paid] of [['pending',true],['paid',false],['completed',false]] as const) {
    await db.query('UPDATE private.orders SET status=$1,paid_at=$2 WHERE id=$3',[status,paid?'2026-11-13T11:00:00Z':null,id(3)]);
    expect((await db.query<{options:any[]}>('SELECT admin_manual_customer_checkout_options($1) options',[id(2)])).rows[0]?.options).toEqual([]);
    await expect(db.query('SELECT admin_manual_customer_checkout_email($1,$2)',[id(2),id(3)])).rejects.toThrow('already paid');
  }
});

test('older manual customers resolve their recipient from the encrypted original order', async () => {
  await db.query('UPDATE private.orders SET status=$1,paid_at=NULL WHERE id=$2',['pending',id(3)]);
  await db.query('UPDATE order_checkout_links SET renewal_customer_id=NULL WHERE order_id=$1',[id(3)]);
  const result=await db.query<{details:any}>('SELECT admin_manual_customer_checkout_email($1,$2) details',[id(3),id(3)]);
  expect(result.rows[0]?.details.email).toBe('customer@example.com');
});

test('staff cannot list or prepare customer checkout emails', async () => {
  await db.exec("SELECT set_config('test.role','staff',false)");
  await expect(db.query('SELECT admin_manual_customer_checkout_options($1)',[id(2)])).rejects.toThrow('Forbidden');
  await expect(db.query('SELECT admin_manual_customer_checkout_email($1,$2)',[id(2),id(3)])).rejects.toThrow('Forbidden');
});