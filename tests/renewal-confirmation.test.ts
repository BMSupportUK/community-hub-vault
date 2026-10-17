import {beforeAll,afterAll,it,expect} from 'bun:test';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
const owner='00000000-0000-0000-0000-000000000001';
const order='00000000-0000-0000-0000-000000000002';
const cred='00000000-0000-0000-0000-000000000003';
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA private;
 CREATE TYPE public.app_role AS ENUM('admin','management','staff','member');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${owner}'::uuid$$;
 CREATE FUNCTION public.has_any_role(uuid,public.app_role[]) RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.role')::public.app_role=ANY($2)$$;
 CREATE TABLE private.orders(id uuid PRIMARY KEY,user_id uuid,paid_at timestamptz,status text,customer_type text,created_at timestamptz,existing_username text);
 CREATE TABLE public.order_checkout_links(order_id uuid PRIMARY KEY,customer_kind text,account_setup_at timestamptz,account_setup_by uuid);
 CREATE TABLE public.order_items(order_id uuid,product_name text,quantity integer);
 CREATE TABLE private.app_credentials(id uuid PRIMARY KEY,owner_id uuid,app_login_name text,expiry_at timestamptz,order_id uuid,updated_at timestamptz);
 CREATE TABLE private.pending_order_credentials(order_id uuid PRIMARY KEY,expiry_at timestamptz);
 SET test.role='admin';`);
 await db.exec(readFileSync(new URL('../drizzle/migrations/0139_renewal_confirmation_updates_credentials.sql',import.meta.url),'utf8'));
});
afterAll(()=>db.close());
async function seed(role='admin',expiry='2090-01-31T12:00:00Z',name='BM Support 1 Month | Single User'){
 await db.exec(`DELETE FROM private.orders; DELETE FROM public.order_checkout_links; DELETE FROM public.order_items; DELETE FROM private.app_credentials; SET test.role='${role}';`);
 await db.query(`INSERT INTO private.orders VALUES($1,$2,now(),'paid','manual',now(),'test-renewal')`,[order,owner]);
 await db.query(`INSERT INTO public.order_checkout_links(order_id,customer_kind) VALUES($1,'existing')`,[order]);
 await db.query(`INSERT INTO public.order_items VALUES($1,$2,1)`,[order,name]);
 await db.query(`INSERT INTO private.app_credentials VALUES($1,$2,'test-renewal',$3,NULL,now())`,[cred,owner,expiry]);
}
async function confirm(){await db.query('SELECT public.admin_set_account_setup($1,true)',[order]);}
async function expiry(){return (await db.query<{expiry:string}>('SELECT expiry_at::text AS expiry FROM private.app_credentials WHERE id=$1',[cred])).rows[0]?.expiry;}
for(const role of ['admin','management'])it(`${role} confirmation extends the saved credential by the one-month sale`,async()=>{
 await seed(role); await confirm(); expect(await expiry()).toBe('2090-02-28 12:00:00+00');
 expect((await db.query('SELECT order_id FROM private.app_credentials WHERE id=$1',[cred])).rows[0]?.order_id).toBe(order);
});
it('repeat and undo/reconfirm do not extend twice',async()=>{await seed();await confirm();await confirm();await db.query('SELECT public.admin_set_account_setup($1,false)',[order]);await confirm();expect(await expiry()).toBe('2090-02-28 12:00:00+00');});
it('an expired credential starts from now',async()=>{await seed('admin','2000-01-01');await confirm();expect((await db.query<{ok:boolean}>("SELECT abs(extract(epoch FROM (expiry_at-(now()+interval '1 month'))))<5 AS ok FROM private.app_credentials")).rows[0]?.ok).toBe(true);});
it('manual expiry save prevents duplicate automatic renewal',async()=>{await seed();await db.query('SELECT public.staff_set_order_credential_expiry($1,$2,$3)',[order,cred,'2092-05-10T12:00:00Z']);await confirm();expect(await expiry()).toBe('2092-05-10 12:00:00+00');});
it('staff cannot confirm subscription extensions',async()=>{await seed('staff');await expect(confirm()).rejects.toThrow('Not authorized');expect(await expiry()).toBe('2090-01-31 12:00:00+00');});
it('unpaid renewals cannot change expiry or confirmation',async()=>{await seed();await db.exec('UPDATE private.orders SET paid_at=NULL');await expect(confirm()).rejects.toThrow('must be paid');expect(await expiry()).toBe('2090-01-31 12:00:00+00');});
it('missing duration fails without marking confirmed',async()=>{await seed('admin',undefined,'Unknown package');await expect(confirm()).rejects.toThrow('length could not be read');expect((await db.query('SELECT account_setup_at FROM public.order_checkout_links')).rows[0]?.account_setup_at).toBeNull();});
it('wrong owner cannot be changed through manual renewal save',async()=>{await seed();await db.exec("UPDATE private.app_credentials SET owner_id='00000000-0000-0000-0000-000000000009'");await expect(db.query('SELECT public.staff_set_order_credential_expiry($1,$2,$3)',[order,cred,'2092-05-10'])).rejects.toThrow('does not belong');});
it('ambiguous accounts require selection rather than renewing the wrong one',async()=>{await seed();await db.exec(`UPDATE private.orders SET existing_username=NULL; INSERT INTO private.app_credentials(id,owner_id,app_login_name,expiry_at) VALUES('00000000-0000-0000-0000-000000000004','${owner}','second','2090-01-01')`);await expect(confirm()).rejects.toThrow('Choose the account');expect(await expiry()).toBe('2090-01-31 12:00:00+00');});
it('sale quantity and years determine the term',async()=>{await seed('admin',undefined,'BM Support 1 Year');await db.exec('UPDATE public.order_items SET quantity=2');await confirm();expect(await expiry()).toBe('2092-01-31 12:00:00+00');});
