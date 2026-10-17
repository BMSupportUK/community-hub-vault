import { afterAll, beforeAll, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const id = '00000000-0000-0000-0000-000000000001';
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA private; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE TABLE private.orders(id uuid, order_ref text, total_cents int, existing_username text, wants_adult_content boolean, manual_pay_method text, paid_at timestamptz, completed_at timestamptz, status text, user_id uuid);
    CREATE TABLE public.order_checkout_links(order_id uuid, customer_kind text, payment_sent_at timestamptz, account_setup_started_at timestamptz);
    CREATE TABLE public.order_items(order_id uuid, product_name text, quantity int);
    CREATE TABLE public.order_payments(order_id uuid, provider text, created_at timestamptz);
    CREATE TABLE public.captured_messages(order_id uuid, message_key text, vals jsonb);
    CREATE FUNCTION public.checkout_auto_post(p_order uuid,p_key text,p_values jsonb) RETURNS void LANGUAGE sql AS 'INSERT INTO public.captured_messages VALUES(p_order,p_key,p_values)';
  `);
  await db.exec(readFileSync(new URL('../drizzle/migrations/0145_fix_checkout_renewal_message_selection.sql', import.meta.url), 'utf8'));
  await db.exec(`
    CREATE TRIGGER order_msgs AFTER UPDATE ON private.orders FOR EACH ROW EXECUTE FUNCTION public.trg_order_checkout_auto_msgs();
    CREATE TRIGGER link_msgs AFTER INSERT OR UPDATE ON public.order_checkout_links FOR EACH ROW EXECUTE FUNCTION public.trg_checkout_link_auto_msgs();
  `);
});
afterAll(() => db.close());

for (const kind of ['new', 'existing', 'renewal']) {
  test(`${kind} order selects its own summary, setup and completion message once`, async () => {
    await db.exec('DELETE FROM public.captured_messages; DELETE FROM public.order_checkout_links; DELETE FROM private.orders;');
    await db.query('INSERT INTO private.orders(id,total_cents,status) VALUES($1,6500,\'paid\')', [id]);
    await db.query('INSERT INTO public.order_checkout_links(order_id,customer_kind) VALUES($1,$2)', [id,kind]);
    const renewal = kind !== 'new';
    expect((await db.query<{ vals: { order_type: string } }>('SELECT vals FROM public.captured_messages')).rows[0]?.vals.order_type).toBe(renewal ? 'Renewal' : 'New account');
    await db.query('UPDATE public.order_checkout_links SET account_setup_started_at=now() WHERE order_id=$1', [id]);
    expect((await db.query<{ message_key: string }>('SELECT message_key FROM public.captured_messages OFFSET 1')).rows).toEqual([{message_key: renewal ? 'order_subscription_updating' : 'order_setting_up_account'}]);
    await db.query('UPDATE private.orders SET completed_at=now(),status=\'completed\' WHERE id=$1', [id]);
    expect((await db.query<{ message_key: string }>('SELECT message_key FROM public.captured_messages OFFSET 2')).rows).toEqual([{message_key: renewal ? 'order_renewal_completed' : 'order_sale_completed'}]);
    await db.query('UPDATE private.orders SET status=\'completed\' WHERE id=$1', [id]);
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.captured_messages')).rows[0]?.count).toBe(3);
  });
}