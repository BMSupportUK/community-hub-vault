import { beforeAll, afterAll, test, expect } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const id = (n:number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
beforeAll(async () => {
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE SCHEMA private;
 CREATE TYPE public.app_role AS ENUM ('admin','management','staff');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''${id(1)}''::uuid';
 CREATE FUNCTION public.has_any_role(uuid,public.app_role[]) RETURNS boolean LANGUAGE sql AS 'SELECT coalesce(current_setting(''test.role'',true)=ANY($2::text[]),false)';
 CREATE TABLE private.orders(id uuid PRIMARY KEY,user_id uuid,customer_type text,paid_at timestamptz,status text,created_at timestamptz,order_ref text,email_enc bytea,existing_username text,shipping_name text);
 CREATE TABLE auth.users(id uuid,email text);
 CREATE FUNCTION private.app_decrypt(bytea) RETURNS text LANGUAGE sql AS 'SELECT convert_from($1,''UTF8'')';
 CREATE TABLE private.pending_order_credentials(order_id uuid,app_login_name text,expiry_at timestamptz);
 CREATE TABLE private.app_credentials(id uuid PRIMARY KEY,owner_id uuid,app_login_name text,account_type text,account_number int,expiry_at timestamptz,order_id uuid,updated_at timestamptz);
 CREATE TABLE public.order_referrals(order_id uuid PRIMARY KEY,referrer_user_id uuid,referrer_name text);
 CREATE TABLE public.order_items(id uuid,order_id uuid,product_name text,quantity int);
 CREATE TABLE public.order_checkout_links(order_id uuid,customer_kind text,claimed_by uuid);
 CREATE TABLE public.products(id uuid PRIMARY KEY,name text,is_active boolean);
 CREATE TABLE public.profiles(id uuid,username text,display_name text);
 CREATE TABLE public.invites(id uuid,used_by uuid,created_by uuid,used_at timestamptz,created_at timestamptz);`);
 await db.exec(readFileSync(new URL('../drizzle/migrations/0147_customer_subscriptions_referral_rewards.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../drizzle/migrations/0148_customer_subscription_manual_account_matching.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../drizzle/migrations/0149_customer_tenure_date_corrections.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../drizzle/migrations/0150_customer_package_allocation.sql',import.meta.url),'utf8'));
 await db.exec(`SELECT set_config('test.role','admin',false);
 INSERT INTO profiles VALUES('${id(2)}','customer','Customer'),('${id(3)}','referrer','Referrer');
 INSERT INTO private.app_credentials VALUES('${id(4)}','${id(3)}','ref-login','single',1,'2027-01-31 12:30+00',NULL,now());`);
});
afterAll(()=>db.close());
async function sale(n:number,name='12 months',kind='new',status='completed',stamp='2026-10-18 10:00+00',paid=true) {
 await db.query(`INSERT INTO private.orders(id,user_id,customer_type,paid_at,status,created_at,order_ref) VALUES($1,$2,$3,$4,$5,$6,$7)`,[id(n),id(2),kind,paid?stamp:null,status,stamp,`SALE-${n}`]);
 await db.query('INSERT INTO order_referrals VALUES($1,$2,$3)',[id(n),id(3),'Referrer']);
 await db.query('INSERT INTO order_items VALUES($1,$2,$3,1)',[id(n+1000),id(n),name]);
}
const grant = (n:number,credential=id(4))=>db.query('SELECT admin_award_referral_month($1,$2) AS expiry',[id(n),credential]);
test('12-month referral adds one calendar month on top of remaining time and clamps month end',async()=>{
 await sale(10); const result=await grant(10); expect(new Date(result.rows[0]?.expiry as string).toISOString()).toBe('2027-02-28T12:30:00.000Z');
});
test('same referred purchase cannot grant twice',async()=>{await expect(grant(10)).rejects.toThrow('already');});
test('all 12-month package types qualify without adding together shorter purchases',async()=>{
 for(const [n,name] of [[11,'Multi Room 12 Months'],[12,'Triple Room 12 months'],[13,'Single 1 year']] as const){await sale(n,name); expect((await db.query<{ok:boolean}>('SELECT referral_reward_eligible($1) ok',[id(n)])).rows[0]?.ok).toBe(true);}
 await sale(14,'6 months'); await db.query('INSERT INTO order_items VALUES($1,$2,$3,1)',[id(1014),id(14),'6 months']); await expect(grant(14)).rejects.toThrow('qualify');
});
test('renewal purchases do not count as new referred signups',async()=>{await sale(15,'12 months','existing'); await expect(grant(15)).rejects.toThrow('qualify');});
test('unpaid and incomplete sales cannot grant a month',async()=>{
 await sale(16,'12 months','new','completed','2026-10-18 10:00+00',false);await expect(grant(16)).rejects.toThrow('qualify');
 await sale(17,'12 months','new','pending');await expect(grant(17)).rejects.toThrow('qualify');
});
test('past sales before the requested going-forward rule do not qualify',async()=>{await sale(18,'12 months','new','completed','2026-10-17 19:14+00');await expect(grant(18)).rejects.toThrow('qualify');});
test('cannot extend an account not owned by the referrer',async()=>{await expect(grant(11,id(999))).rejects.toThrow('saved accounts');});
test('only admin may grant rewards, management can read the list, staff cannot',async()=>{
 await db.exec("SELECT set_config('test.role','management',false)");await expect(grant(11)).rejects.toThrow('Only admin');
 expect((await db.query('SELECT admin_customer_subscriptions() data')).rows.length).toBe(1);
 await db.exec("SELECT set_config('test.role','staff',false)");await expect(db.query('SELECT admin_customer_subscriptions()')).rejects.toThrow('Forbidden');
 await db.exec("SELECT set_config('test.role','admin',false)");
});
test('customer list reports recorded first purchase, renewal date, package and referrer without passwords',async()=>{
 const rows=(await db.query<{data:any[]}>('SELECT admin_customer_subscriptions() data')).rows[0]?.data??[];
 const c=rows.find(c=>c.username==='customer'); expect(c?.referrerName).toBe('Referrer');expect(c?.package).toContain('12 months');expect(c?.renewedAt).toContain('2026-10-18');expect(c?.firstSubscriptionAt).toContain('2026-10-17');expect(Object.keys(c??{})).not.toContain('password');
});
test('expired referrer subscription starts the free month from now',async()=>{
 await db.exec(`UPDATE private.app_credentials SET expiry_at='2020-01-01' WHERE id='${id(4)}'`);
 await grant(12);
 const r=(await db.query<{ok:boolean}>(`SELECT expiry_at>now()+interval '27 days' AS ok FROM private.app_credentials WHERE id='${id(4)}'`)).rows[0];expect(r?.ok).toBe(true);
});
test('manual subscriptions match the customer email, not staff creator, and include saved pre-account expiry',async()=>{
 await sale(20,'Multi Room 12 months','manual');
 await db.exec(`INSERT INTO auth.users VALUES('${id(2)}','customer@example.test'); UPDATE private.orders SET user_id='${id(1)}',email_enc=convert_to('customer@example.test','UTF8') WHERE id='${id(20)}'; INSERT INTO private.pending_order_credentials VALUES('${id(20)}','customer-login','2027-10-18 12:00+00');`);
 const rows=(await db.query<{data:any[]}>('SELECT admin_customer_subscriptions() data')).rows[0]?.data??[];
 expect(rows.some(c=>c.userId===id(1))).toBe(false);expect(rows.find(c=>c.userId===id(2))?.accounts[0]?.login).toBe('customer-login');
});

test('admin backdates first subscription and tenure uses completed years without changing expiry',async()=>{
 const before=(await db.query('SELECT expiry_at FROM private.app_credentials WHERE id=$1',[id(4)])).rows[0];
 const start=(await db.query<{d:string}>("SELECT ((now() AT TIME ZONE 'Europe/London')::date-interval '5 years'+interval '1 day')::date::text d")).rows[0]?.d;
 await db.query('SELECT admin_set_customer_first_subscription($1,$2)',[id(2),start]);
 const rows=(await db.query<{data:any[]}>('SELECT admin_customer_subscriptions_with_tenure() data')).rows[0]?.data??[];
 const c=rows.find(c=>c.userId===id(2));expect(c?.customerYears).toBe(4);expect(c?.firstSubscriptionAt).toBe(start);expect(c?.firstSubscriptionAdjusted).toBe(true);
 expect((await db.query('SELECT expiry_at FROM private.app_credentials WHERE id=$1',[id(4)])).rows[0]).toEqual(before);
 await db.query('SELECT admin_set_customer_first_subscription($1,NULL)',[id(2)]);
 expect((await db.query<{data:any[]}>('SELECT admin_customer_subscriptions_with_tenure() data')).rows[0]?.data.find(c=>c.userId===id(2))?.firstSubscriptionAdjusted).toBe(false);
});
test('management cannot backdate customer history',async()=>{
 await db.exec("SELECT set_config('test.role','management',false)");
 await expect(db.query('SELECT admin_set_customer_first_subscription($1,$2)',[id(2),'2020-01-01'])).rejects.toThrow('Only admin');
 await db.exec("SELECT set_config('test.role','admin',false)");
});
test('future first subscription dates are rejected',async()=>{
 await expect(db.query("SELECT admin_set_customer_first_subscription($1,current_date+2)",[id(2)])).rejects.toThrow('future');
});

test('admin allocation saves a missing package and preserves saved login and expiry',async()=>{
 await db.exec(`INSERT INTO products VALUES('${id(500)}','Single 12 months',true),('${id(501)}','Retired',false)`);
 const before=(await db.query('SELECT expiry_at FROM private.app_credentials WHERE id=$1',[id(4)])).rows[0];
 await db.query('SELECT admin_allocate_customer_package($1,$2)',[id(3),id(500)]);
 const c=(await db.query<{data:any[]}>('SELECT admin_customer_subscription_details() data')).rows[0]?.data.find(c=>c.userId===id(3));
 expect(c?.package).toBe('Single 12 months');expect(c?.packageAllocated).toBe(true);expect(c?.accounts.map((a:any)=>a.login)).toEqual(['ref-login']);
 expect((await db.query('SELECT expiry_at FROM private.app_credentials WHERE id=$1',[id(4)])).rows[0]).toEqual(before);
});
test('purchase quantities are excluded from current package names',async()=>{
 await sale(30,'Triple Room 12 months','existing','completed','2027-01-01 12:00+00');
 await db.query('UPDATE order_items SET quantity=3 WHERE order_id=$1',[id(30)]);
 const c=(await db.query<{data:any[]}>('SELECT admin_customer_subscription_details() data')).rows[0]?.data.find(c=>c.userId===id(2));
 expect(c?.package).toBe('Triple Room 12 months');
 await expect(db.query('SELECT admin_allocate_customer_package($1,$2)',[id(2),id(500)])).rejects.toThrow('already has');
});
test('management cannot allocate packages',async()=>{
 await db.exec("SELECT set_config('test.role','management',false)");
 await expect(db.query('SELECT admin_allocate_customer_package($1,$2)',[id(3),id(500)])).rejects.toThrow('Only admin');
 await db.exec("SELECT set_config('test.role','admin',false)");
});
test('allocation rejects unknown customers and unavailable packages',async()=>{
 await expect(db.query('SELECT admin_allocate_customer_package($1,$2)',[id(999),id(500)])).rejects.toThrow('Customer not found');
 await expect(db.query('SELECT admin_allocate_customer_package($1,$2)',[id(3),id(501)])).rejects.toThrow('available package');
});
