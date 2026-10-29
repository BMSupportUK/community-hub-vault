import { afterAll, beforeAll, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA private;
    CREATE TYPE public.app_role AS ENUM ('member','subscriber','nonsubscriber','pending','banned','rejected','admin','management','staff','moderator');
    CREATE TABLE public.profiles(id uuid, username text, display_name text);
    CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
    CREATE TABLE public.manually_added_customers(user_id uuid);
    CREATE TABLE private.app_credentials(owner_id uuid);
    CREATE TABLE private.orders(customer_id uuid);
    CREATE FUNCTION public.admin_customer_subscriptions() RETURNS jsonb LANGUAGE sql AS $$
      WITH paid AS (SELECT customer_id FROM private.orders)
      SELECT coalesce(jsonb_agg(p.username),'[]'::jsonb) FROM public.profiles p
      WHERE EXISTS(SELECT 1 FROM public.manually_added_customers m WHERE m.user_id=p.id) OR EXISTS(SELECT 1 FROM private.app_credentials c WHERE c.owner_id=p.id) OR EXISTS(SELECT 1 FROM paid WHERE paid.customer_id=p.id)
    $$;
  `);
  await db.exec(readFileSync(new URL('../drizzle/migrations/0248_include_approved_members_in_admin_customers.sql', import.meta.url), 'utf8'));
});
afterAll(() => db.close());

test('gate-approved member appears without a paid order or app credentials', async () => {
  await db.exec(`
    INSERT INTO public.profiles VALUES ('3339e18d-0c78-46e8-b8c9-a9f947fbcf56','charmainea','Charmaine A');
    INSERT INTO public.user_roles VALUES ('3339e18d-0c78-46e8-b8c9-a9f947fbcf56','member');
  `);
  const result = await db.query<{ customers: string[] }>('SELECT public.admin_customer_subscriptions() AS customers');
  expect(result.rows[0]?.customers).toEqual(['charmainea']);
});

for (const role of ['pending','banned','rejected','admin','management','staff','moderator']) {
  test(`${role} does not qualify as an approved customer without subscription records`, async () => {
    const result = await db.query<{ eligible: boolean }>("SELECT public.customer_has_approved_member_role(ARRAY['member',$1]::public.app_role[]) AS eligible", [role]);
    expect(result.rows[0]?.eligible).toBe(false);
  });
}