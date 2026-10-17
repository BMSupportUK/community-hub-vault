import { afterAll, beforeAll, expect, it } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const uid = '7852b1ea-1da6-4fe5-a6e3-01ab1a5c6eee';
beforeAll(async () => {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE TYPE public.app_role AS ENUM ('admin','management','staff','moderator','member');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${uid}'::uuid $$;
 CREATE FUNCTION public.has_any_role(uuid, public.app_role[]) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.role')::public.app_role = ANY($2) $$;
 CREATE TABLE public.ticket_categories(id uuid PRIMARY KEY, slug text);
 CREATE TABLE public.tickets(id uuid PRIMARY KEY, user_id uuid, category_id uuid, order_id uuid);
 CREATE TABLE public.ticket_messages(id uuid PRIMARY KEY, ticket_id uuid, sender_id uuid, is_internal boolean);
 GRANT USAGE ON SCHEMA auth TO authenticated;
 GRANT SELECT, INSERT, UPDATE ON public.tickets, public.ticket_messages TO authenticated;
 ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY; ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "tickets read own or staff" ON public.tickets FOR SELECT TO authenticated USING(false);
 CREATE POLICY "tickets update staff" ON public.tickets FOR UPDATE TO authenticated USING(false);
 CREATE POLICY "tmsg read participants" ON public.ticket_messages FOR SELECT TO authenticated USING(false);
 CREATE POLICY "tmsg insert participants" ON public.ticket_messages FOR INSERT TO authenticated WITH CHECK(false);
 INSERT INTO public.ticket_categories VALUES ('00000000-0000-0000-0000-000000000010','general'),('76d6c908-d465-412c-a457-a24edc5ebed4','orders'),('30a7e109-2152-4dad-b77d-51c57658eeee','owner-management');
 INSERT INTO public.tickets VALUES
 ('00000000-0000-0000-0000-000000000100',NULL,'00000000-0000-0000-0000-000000000010',NULL),
 ('8d4e8026-477d-4bd0-8b72-268a03d8afa3',NULL,'76d6c908-d465-412c-a457-a24edc5ebed4',NULL),
 ('00000000-0000-0000-0000-000000000102',NULL,'30a7e109-2152-4dad-b77d-51c57658eeee',NULL),
 ('00000000-0000-0000-0000-000000000103',NULL,'76d6c908-d465-412c-a457-a24edc5ebed4','${uid}');
 INSERT INTO public.ticket_messages SELECT id,id,user_id,false FROM public.tickets;`);
 await db.exec(readFileSync(new URL('../drizzle/migrations/0138_restore_staff_orders_ticket_access.sql', import.meta.url),'utf8'));
});
afterAll(async () => { await db.close(); });
async function visible(role: string, table='tickets') {
 await db.exec(`RESET ROLE; SET test.role='${role}'; SET ROLE authenticated;`);
 return (await db.query<{id:string}>(`SELECT id FROM public.${table} ORDER BY id`)).rows.map(r=>r.id);
}
for (const role of ['staff','moderator']) {
 it(`${role} sees general and Orders renewals, not management or order-linked sales`, async()=>{
  expect(await visible(role)).toEqual(['00000000-0000-0000-0000-000000000100','8d4e8026-477d-4bd0-8b72-268a03d8afa3']);
 });
 it(`${role} reads the matching message scope`, async()=>{
  expect(await visible(role,'ticket_messages')).toEqual(['00000000-0000-0000-0000-000000000100','8d4e8026-477d-4bd0-8b72-268a03d8afa3']);
 });
 it(`${role} can reply and update an Orders renewal`, async()=>{
  await visible(role);
  await db.query('INSERT INTO public.ticket_messages VALUES(gen_random_uuid(),$1,$2,false)',['8d4e8026-477d-4bd0-8b72-268a03d8afa3',uid]);
  expect((await db.query('UPDATE public.tickets SET order_id=NULL WHERE id=$1 RETURNING id',['8d4e8026-477d-4bd0-8b72-268a03d8afa3'])).rows.length).toBe(1);
  await db.exec(`RESET ROLE; DELETE FROM public.ticket_messages WHERE sender_id='${uid}';`);
 });
}
it('members cannot read another customer tickets',async()=>{expect(await visible('member')).toEqual([]);});
for(const role of ['admin','management']) it(`${role} retains all ticket types`,async()=>{expect((await visible(role)).length).toBe(4);});
