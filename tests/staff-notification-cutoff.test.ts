import { afterAll, beforeAll, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const member = '11111111-1111-1111-1111-111111111111';
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TYPE public.app_role AS ENUM ('member','admin','management','staff','moderator');
    CREATE TABLE public.user_roles(user_id uuid, role public.app_role, created_at timestamptz);
    CREATE TABLE public.staff_notifications(id text, created_at timestamptz);
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT SELECT ON public.staff_notifications TO authenticated;
    ALTER TABLE public.staff_notifications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY existing_staff_access ON public.staff_notifications FOR SELECT TO authenticated USING (true);
    INSERT INTO public.user_roles VALUES ('${member}', 'member', '2026-10-01 09:00+00');
    INSERT INTO public.staff_notifications VALUES
      ('before_signup','2026-09-01 09:00+00'),
      ('before_staff','2026-10-29 16:59:59+00'),
      ('at_staff','2026-10-29 17:00+00'),
      ('after_staff','2026-10-29 17:01+00');
  `);
  await db.exec(readFileSync(new URL('../drizzle/migrations/0249_staff_notification_join_cutoff.sql', import.meta.url), 'utf8'));
});
afterAll(() => db.close());

async function visible() {
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${member}';`);
  try {
    const result = await db.query<{ id: string }>('SELECT id FROM public.staff_notifications ORDER BY created_at');
    return result.rows.map(row => row.id);
  } finally {
    await db.exec('RESET ROLE');
  }
}

test('member has no shared staff notifications before promotion', async () => {
  expect(await visible()).toEqual([]);
});

test('promoted member sees only notifications from becoming staff, not signup or historical backlog', async () => {
  await db.exec(`INSERT INTO public.user_roles VALUES ('${member}', 'staff', '2026-10-29 17:00+00')`);
  expect(await visible()).toEqual(['at_staff', 'after_staff']);
});

test('adding another staff role does not reset the staff notification start', async () => {
  await db.exec(`INSERT INTO public.user_roles VALUES ('${member}', 'management', '2026-10-29 17:02+00')`);
  expect(await visible()).toEqual(['at_staff', 'after_staff']);
});

test('other staff retain their own history and shared notification rows are never deleted', async () => {
  await db.exec(`INSERT INTO public.user_roles VALUES ('22222222-2222-2222-2222-222222222222', 'staff', '2026-08-01 09:00+00');
    SET ROLE authenticated; SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';`);
  try {
    const result = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.staff_notifications');
    expect(result.rows[0]?.count).toBe(4);
  } finally {
    await db.exec('RESET ROLE');
  }
});