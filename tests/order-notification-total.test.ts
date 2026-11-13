import { test, expect } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

test('manual-order alert reads the final discounted total after creation, once only', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA private;
      CREATE TABLE private.orders(id uuid PRIMARY KEY, user_id uuid, customer_type text, shipping_name text, total_cents integer);
      CREATE TABLE public.profiles(id uuid, display_name text, username text);
      CREATE TABLE public.app_settings(key text, value jsonb);
      CREATE TABLE public.staff_notifications(kind text, title text, body text, link_path text, entity_id uuid);
      CREATE FUNCTION public.notify_new_order() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
      CREATE TRIGGER trg_notify_new_order AFTER INSERT ON private.orders FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();
      INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-000000000001','Dane J','DaneJ');
    `);
    await db.exec(readFileSync(new URL('../drizzle/migrations/0354_order_notification_final_total.sql', import.meta.url), 'utf8'));
    await db.exec(`BEGIN;
      INSERT INTO private.orders VALUES ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','manual','Matty Brown',0);
      UPDATE private.orders SET total_cents=12000;
      UPDATE private.orders SET total_cents=10000;
    `);
    expect((await db.query('SELECT * FROM staff_notifications')).rows).toHaveLength(0);
    await db.exec('COMMIT');
    expect((await db.query('SELECT body,link_path,entity_id FROM staff_notifications')).rows).toEqual([{
      body: 'Dane J added a manual order for Matty Brown (£100.00)',
      link_path: '/admin-secure-page?order=00000000-0000-0000-0000-000000000002',
      entity_id: '00000000-0000-0000-0000-000000000002',
    }]);
    await db.exec('UPDATE private.orders SET total_cents=10500');
    expect((await db.query('SELECT * FROM staff_notifications')).rows).toHaveLength(1);
  } finally { await db.close(); }
});

test('ordinary order alerts retain their finished amount and destination', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA private;
      CREATE TABLE private.orders(id uuid PRIMARY KEY,user_id uuid,customer_type text,shipping_name text,total_cents integer);
      CREATE TABLE profiles(id uuid,display_name text,username text);
      CREATE TABLE app_settings(key text,value jsonb);
      CREATE TABLE staff_notifications(kind text,title text,body text,link_path text,entity_id uuid);
      CREATE FUNCTION notify_new_order() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
      CREATE TRIGGER trg_notify_new_order AFTER INSERT ON private.orders FOR EACH ROW EXECUTE FUNCTION notify_new_order();
      INSERT INTO profiles VALUES ('00000000-0000-0000-0000-000000000001',NULL,'Customer');
      INSERT INTO app_settings VALUES ('currency','{"symbol":"£"}');`);
    await db.exec(readFileSync(new URL('../drizzle/migrations/0354_order_notification_final_total.sql', import.meta.url), 'utf8'));
    await db.exec(`INSERT INTO private.orders VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','site','Customer',5999);`);
    expect((await db.query('SELECT kind,title,body FROM staff_notifications')).rows).toEqual([
      {kind:'order_placed',title:'New order',body:'Customer placed an order (£59.99)'},
    ]);
  } finally { await db.close(); }
});