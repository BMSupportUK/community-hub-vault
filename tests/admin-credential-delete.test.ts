import { beforeAll, afterAll, test, expect } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000001';
const login = '00000000-0000-0000-0000-000000000002';
beforeAll(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE TYPE public.app_role AS ENUM ('admin','management','staff');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''${owner}''::uuid';
    CREATE FUNCTION public.has_any_role(uuid,public.app_role[]) RETURNS boolean LANGUAGE sql AS 'SELECT coalesce(current_setting(''test.role'',true)=ANY($2::text[]),false)';
    CREATE TABLE private.app_credentials(id uuid PRIMARY KEY,owner_id uuid);
    CREATE TABLE public.credential_change_events(credential_id uuid,owner_id uuid);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY);
    INSERT INTO public.profiles VALUES('${owner}');`);
  await db.exec(readFileSync(new URL('../drizzle/migrations/0336_admin_delete_customer_credential.sql',import.meta.url),'utf8'));
});
afterAll(() => db.close());
test('admin deletes the selected login profile but preserves the website account',async()=>{
  await db.exec(`SELECT set_config('test.role','admin',false); INSERT INTO private.app_credentials VALUES('${login}','${owner}');`);
  expect((await db.query<{removed:boolean}>('SELECT admin_delete_customer_credential($1,$2) removed',[owner,login])).rows[0]?.removed).toBe(true);
  expect((await db.query('SELECT id FROM private.app_credentials WHERE id=$1',[login])).rows).toHaveLength(0);
  expect((await db.query('SELECT id FROM public.profiles WHERE id=$1',[owner])).rows).toHaveLength(1);
  expect((await db.query('SELECT credential_id FROM credential_change_events WHERE credential_id=$1',[login])).rows).toHaveLength(1);
});
test('a missing login cannot falsely report deletion',async()=>{
  await expect(db.query('SELECT admin_delete_customer_credential($1,$2)',[owner,login])).rejects.toThrow('Login was not found');
});
test('staff cannot delete login profiles',async()=>{
  await db.exec("SELECT set_config('test.role','staff',false)");
  await expect(db.query('SELECT admin_delete_customer_credential($1,$2)',[owner,login])).rejects.toThrow('Forbidden');
});