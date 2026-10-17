import { afterAll, beforeAll, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const id = '3de3a26b-03d5-4f5f-bd2a-e87eded4f9d8';
const admin = '73c113ce-ce1b-43f0-af24-c2a36cf0d8e7';
beforeAll(async () => {
  await db.exec(`CREATE SCHEMA private;
    CREATE TYPE public.app_role AS ENUM ('admin','management','staff');
    CREATE TABLE public.profiles(id uuid, username text, display_name text);
    CREATE TABLE public.app_settings(key text, value jsonb);
    CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
    CREATE TABLE public.staff_notifications(kind text,title text,body text,link_path text,entity_id uuid);
    CREATE TABLE public.user_notifications(user_id uuid,kind text,title text,body text,link_path text,source_type text,source_id uuid);
    CREATE TABLE public.orders(id uuid,customer_type text,user_id uuid,shipping_name text,total_cents int,paid_at timestamptz,paid_by uuid);
    INSERT INTO public.app_settings VALUES ('currency','{"symbol":"£"}');
    INSERT INTO public.profiles VALUES ('${admin}','Test','Test');
    INSERT INTO public.user_roles VALUES ('${admin}','admin');`);
  for (const path of ['0106_manual_order_notification_same_kind.sql', '0107_manual_order_paid_notification.sql', '0141_staff_order_notifications_secure_checkout.sql']) {
    await db.exec(readFileSync(new URL(`../drizzle/migrations/${path}`, import.meta.url), 'utf8'));
  }
  await db.exec(`CREATE TRIGGER order_notice AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();
    CREATE TRIGGER paid_notice AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.notify_staff_order_paid();`);
});
afterAll(() => db.close());
for (const type of ['manual','shop']) test(`${type} order trigger links staff to exact secure checkout`, async () => {
  await db.exec('DELETE FROM public.staff_notifications; DELETE FROM public.orders;');
  await db.query(`INSERT INTO public.orders(id,customer_type,user_id,shipping_name,total_cents) VALUES($1,$2,$3,'Test customer',100)`, [id,type,admin]);
  expect((await db.query<{link_path:string}>('SELECT link_path FROM public.staff_notifications')).rows).toEqual([{link_path:`/admin-secure-page?order=${id}`}]);
});
test('staff payment confirmation links to secure checkout', async () => {
  await db.query('UPDATE public.orders SET paid_at=now(),paid_by=$1 WHERE id=$2',[admin,id]);
  expect((await db.query<{link_path:string}>('SELECT link_path FROM public.user_notifications')).rows).toEqual([{link_path:`/admin-secure-page?order=${id}`}]);
});