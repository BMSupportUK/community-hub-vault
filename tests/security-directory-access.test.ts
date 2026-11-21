import { afterAll, beforeAll, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const member = '00000000-0000-0000-0000-000000000001';
const staff = '00000000-0000-0000-0000-000000000002';
const pending = '00000000-0000-0000-0000-000000000003';
const fan = '00000000-0000-0000-0000-000000000004';
const post = '00000000-0000-0000-0000-000000000005';
async function caller(id: string) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
}
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.user_roles(user_id uuid, role text);
    CREATE TABLE public.fan_zone_members(user_id uuid,status text,hide_friends boolean);
    CREATE TABLE public.content_reports(target_id uuid,kind text,status text);
    CREATE TABLE public.profiles(id uuid,display_name text,username text,avatar_url text);
    CREATE TABLE public.invites(created_by uuid,used_by uuid);
    CREATE TABLE public.order_checkout_links(order_id uuid,password text,account_setup_at timestamptz,token text,claimed_by uuid);
    CREATE TABLE private.orders(id uuid,user_id uuid,paid_at timestamptz,status text);
    CREATE TABLE private.app_credentials(owner_id uuid,order_id uuid,app_login_name text,password_enc text,account_type text,expiry_at timestamptz,account_number int);
    CREATE FUNCTION private.app_decrypt(text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;
    CREATE FUNCTION public.caller_is_approved_member_or_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
      SELECT auth.uid() IS NOT NULL AND (
        EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('admin','management','staff','moderator'))
        OR (EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('member','subscriber','nonsubscriber'))
        AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('pending','banned','rejected')))) $$;
    CREATE FUNCTION public.caller_is_staff_or_fan_zone() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
      SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('admin','management','staff','moderator','boro_fan_zone_moderator'))
      OR EXISTS(SELECT 1 FROM public.fan_zone_members WHERE user_id=auth.uid() AND status='approved')) $$;
    INSERT INTO public.user_roles VALUES ('${member}','member'),('${staff}','staff'),('${pending}','pending');
    INSERT INTO public.profiles VALUES ('${member}','Member','member',null);
    INSERT INTO public.invites VALUES ('${member}','${fan}');
    INSERT INTO public.fan_zone_members VALUES ('${fan}','approved',true);
    INSERT INTO public.content_reports VALUES ('${post}','forum_post','pending');
    INSERT INTO private.orders VALUES ('${post}','${member}',now(),'paid');
    INSERT INTO public.order_checkout_links VALUES ('${post}','CORRECT',now(),'test-order','${member}');
    INSERT INTO private.app_credentials VALUES ('${member}','${post}','sample','sample-secret','single',now(),1);
  `);
  await db.exec(readFileSync(new URL('../drizzle/migrations/0392_secure_remaining_directory_lookups.sql', import.meta.url), 'utf8'));
});
afterAll(() => db.close());

for (const [label, id, count] of [['signed out','',0],['pending',pending,0],['member',member,1],['staff',staff,1]] as const) {
  test(`${label} directory and referral access`, async () => {
    await caller(id);
    expect((await db.query('SELECT * FROM public.directory_member_roles()')).rows).toHaveLength(count);
    expect((await db.query('SELECT * FROM public.get_invite_leaderboard()')).rows).toHaveLength(count);
  });
}
for (const [label,id,count] of [['signed out','',0],['pending',pending,0],['ordinary BM member',member,0],['approved Fan Zone member',fan,1],['staff',staff,1]] as const) {
  test(`${label} forum counts and friend visibility access`, async () => {
    await caller(id);
    expect((await db.query('SELECT * FROM public.forum_reported_posts(ARRAY[$1]::uuid[])',[post])).rows).toHaveLength(count);
    expect((await db.query('SELECT * FROM public.fan_zone_hide_friends(ARRAY[$1]::uuid[])',[fan])).rows).toHaveLength(count);
  });
}
for (const password of [null,'','WRONG','CORRECT']) {
  test(`claimed checkout requires correct password (${password ?? 'missing'})`, async () => {
    await caller(member);
    expect((await db.query('SELECT * FROM public.checkout_app_login($1,$2)',['test-order',password])).rows).toHaveLength(password === 'CORRECT' ? 1 : 0);
  });
}
test('anonymous callers cannot execute directory lookups', async () => {
  for (const name of ['directory_member_roles()','get_invite_leaderboard()','fan_zone_hide_friends(uuid[])','forum_reported_posts(uuid[])']) {
    const result = await db.query<{allowed:boolean}>('SELECT has_function_privilege($1,$2,$3) AS allowed',['anon',name,'EXECUTE']);
    expect(result.rows[0]?.allowed).toBe(false);
  }
});