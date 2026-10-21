import { afterAll, beforeAll, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const owner = '73c113ce-ce1b-43f0-af24-c2a36cf0d8e7';
const other = '73c113ce-ce1b-43f0-af24-c2a36cf0d8e8';
const order = '3de3a26b-03d5-4f5f-bd2a-e87eded4f9d8';
beforeAll(async () => {
  await db.exec(`CREATE SCHEMA private; CREATE SCHEMA auth;
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.user',true),'')::uuid $$;
    CREATE TABLE private.orders(id uuid,user_id uuid,order_ref text);
    CREATE TABLE public.order_checkout_links(order_id uuid,token text,password text);
    CREATE TABLE public.user_notifications(user_id uuid,kind text,title text,body text,link_path text,source_type text,source_id uuid,created_at timestamptz DEFAULT now());
    INSERT INTO private.orders VALUES('${order}','${owner}','TEST-ORDER');
    INSERT INTO public.order_checkout_links VALUES('${order}','secret-token','secret-password');`);
  await db.exec(readFileSync(new URL('../drizzle/migrations/0182_request_customer_order_password.sql', import.meta.url),'utf8'));
});
afterAll(() => db.close());
test('only the signed-in order owner can request a password notification', async () => {
  await expect(db.query('SELECT public.request_my_order_password($1)',[order])).rejects.toThrow('Not signed in');
  await db.query("SELECT set_config('app.user',$1,false)",[other]);
  await expect(db.query('SELECT public.request_my_order_password($1)',[order])).rejects.toThrow('Not authorized');
  await db.query("SELECT set_config('app.user',$1,false)",[owner]);
  expect((await db.query('SELECT public.request_my_order_password($1) AS sent',[order])).rows).toEqual([{sent:true}]);
  const rows = (await db.query('SELECT * FROM public.user_notifications')).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({user_id:owner,kind:'customer_order_password',source_id:order,link_path:'/shop?tab=orders'});
  expect(JSON.stringify(rows)).not.toContain('secret-password');
  expect(JSON.stringify(rows)).not.toContain('secret-token');
});
test('rapid repeat requests do not send duplicate notifications', async () => {
  expect((await db.query('SELECT public.request_my_order_password($1) AS sent',[order])).rows).toEqual([{sent:false}]);
  expect((await db.query('SELECT * FROM public.user_notifications')).rows).toHaveLength(1);
});