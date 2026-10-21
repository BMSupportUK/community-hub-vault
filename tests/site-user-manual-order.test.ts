import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("site-user manual orders are owned by the selected user, unpaid and send one password-free payment notification atomically", () => {
  const result = spawnSync(process.execPath.includes("bun") ? "node" : process.execPath, ["--input-type=module"], {
    encoding: "utf8",
    input: `
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(\`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA private;
CREATE TYPE app_role AS ENUM('admin','management','staff');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''00000000-0000-0000-0000-000000000001''::uuid';
CREATE FUNCTION has_any_role(uuid,app_role[]) RETURNS boolean LANGUAGE sql AS 'SELECT current_setting(''test.role'',true)=ANY($2::text[])';
CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS 'SELECT current_setting(''test.role'',true)=$2::text';
CREATE FUNCTION app_encrypt(text) RETURNS text LANGUAGE sql AS 'SELECT $1';
CREATE TABLE private.orders(id uuid DEFAULT gen_random_uuid(),user_id uuid,status text,total_cents int,shipping_name text,customer_type text,notes text,manual_pay_method text,created_at timestamptz,email_enc text,discount_cents int,paid_at timestamptz,order_ref text);
CREATE TABLE products(id uuid,name text,price_cents int,is_active boolean);
CREATE TABLE order_items(order_id uuid,product_id uuid,product_name text,unit_price_cents int,quantity int);
CREATE TABLE order_checkout_links(order_id uuid,token text,password text,customer_kind text,claimed_by uuid);
CREATE TABLE checkout_chat_messages(order_id uuid,sender text,staff_id uuid,content text);
CREATE TABLE user_notifications(user_id uuid,kind text,title text,body text,link_path text,source_type text,source_id uuid);
CREATE FUNCTION admin_order_site_users() RETURNS TABLE(id uuid,username text,display_name text,email text) LANGUAGE sql AS 'SELECT ''00000000-0000-0000-0000-000000000002''::uuid,''customer'',''Customer'',''customer@example.test''';
INSERT INTO products VALUES('00000000-0000-0000-0000-000000000003','12 month package',4900,true);\`);
await db.exec(readFileSync('drizzle/migrations/0181_customer_order_payment_notification.sql','utf8'));
const migration=readFileSync('drizzle/migrations/0184_manual_order_site_customer_selection.sql','utf8');
await db.exec(migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.admin_create_manual_order_v5')));
const items=JSON.stringify([{product_id:'00000000-0000-0000-0000-000000000003',quantity:1}]);
for(const role of ['admin','management']) {
 await db.query("SELECT set_config('test.role',$1,false)",[role]);
 const {rows}=await db.query("SELECT admin_create_manual_order_v5('Customer',$1::jsonb,'square',_site_user_id:='00000000-0000-0000-0000-000000000002') id",[items]);
 const oid=rows[0].id;
 const order=(await db.query('SELECT * FROM private.orders WHERE id=$1',[oid])).rows[0];
 assert.equal(order.user_id,'00000000-0000-0000-0000-000000000002');assert.equal(order.status,'pending');assert.equal(order.total_cents,4900);assert.equal(order.paid_at,null);
 const notices=(await db.query('SELECT * FROM user_notifications WHERE source_id=$1',[oid])).rows;
 assert.equal(notices.length,1);assert.equal(notices[0].user_id,order.user_id);assert.equal(notices[0].kind,'customer_order_payment');
 const link=(await db.query('SELECT * FROM order_checkout_links WHERE order_id=$1',[oid])).rows[0];
 assert.equal(link.claimed_by,order.user_id);assert.ok(!notices[0].body.includes(link.password));assert.ok(!notices[0].body.includes(link.token));
 await assert.rejects(db.query('SELECT * FROM get_my_order_chat_access($1)',[oid]),/Not authorized/);
 // The creating admin is not the owner and cannot fetch the customer's password.
}
await db.query("SELECT set_config('test.role','staff',false)");
await assert.rejects(db.query("SELECT admin_create_manual_order_v5('Customer',$1::jsonb,'square',_site_user_id:='00000000-0000-0000-0000-000000000002')",[items]),/Only admin and management/);
await db.query("SELECT set_config('test.role','admin',false)");
const before=(await db.query('SELECT count(*)::int n FROM private.orders')).rows[0].n;
await assert.rejects(db.query("SELECT admin_create_manual_order_v5('Customer',$1::jsonb,'square',_site_user_id:='00000000-0000-0000-0000-000000000099')",[items]),/Choose an active site user/);
await assert.rejects(db.query("SELECT admin_create_manual_order_v5('Customer',$1::jsonb,'square',_site_user_id:='00000000-0000-0000-0000-000000000002')",[JSON.stringify([{product_id:'00000000-0000-0000-0000-000000000099',quantity:1}])]),/Unknown or inactive product/);
assert.equal((await db.query('SELECT count(*)::int n FROM private.orders')).rows[0].n,before);
await db.close();console.log('passed');
`,
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe("passed");
});