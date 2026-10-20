import { beforeAll, afterAll, test, expect } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const manager = '00000000-0000-0000-0000-000000000001';
const requester = '00000000-0000-0000-0000-000000000002';
const target = '00000000-0000-0000-0000-000000000003';
const migration = (name: string) => readFileSync(new URL(`../drizzle/migrations/${name}`, import.meta.url), 'utf8');

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TYPE public.app_role AS ENUM ('admin','management','staff','moderator');
    CREATE TYPE public.request_status AS ENUM ('pending','approved','denied');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION public.has_any_role(_id uuid,_roles public.app_role[]) RETURNS boolean LANGUAGE sql AS $$
      SELECT CASE WHEN _id='${manager}'::uuid THEN 'management'::public.app_role=ANY(_roles)
        WHEN _id IN ('${requester}'::uuid,'${target}'::uuid) THEN 'staff'::public.app_role=ANY(_roles) ELSE false END $$;
    CREATE TABLE public.shift_slots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shift_date date,
      start_time time, end_time time, slot_type text, assigned_to uuid, notes text, created_by uuid);
    CREATE TABLE public.cover_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, reason text,
      cover_until time, status text DEFAULT 'pending', decided_by uuid, decided_at timestamptz, slot_id uuid, shift_id uuid);
    CREATE TABLE public.shifts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, clock_out timestamptz,
      cover_request_id uuid, cover_reason text);
    CREATE TABLE public.shift_swap_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slot_id uuid,
      requester_id uuid, target_user_id uuid, status public.request_status DEFAULT 'pending', reviewed_by uuid, reviewed_at timestamptz);
    CREATE FUNCTION public.shift_slots_one_per_person_day() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.assigned_to IS NOT NULL AND NEW.slot_type='shift'
        AND (TG_OP='INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
        AND EXISTS (SELECT 1 FROM public.shift_slots s WHERE s.shift_date=NEW.shift_date
          AND s.slot_type='shift' AND s.assigned_to=NEW.assigned_to AND s.id<>NEW.id) THEN
        RAISE EXCEPTION 'You already have a shift booked that day'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER shift_slots_one_per_person_day BEFORE INSERT OR UPDATE ON public.shift_slots
      FOR EACH ROW EXECUTE FUNCTION public.shift_slots_one_per_person_day();
    SELECT set_config('test.uid','${manager}',false);`);
  await db.exec(migration('0176_block_closed_rota_bookings.sql'));
  // Reproduce the original failure before applying the fix.
  await expect(db.exec(`INSERT INTO shift_slots(shift_date,assigned_to) VALUES ((now() AT TIME ZONE 'Europe/London')::date,'${requester}')`)).rejects.toThrow('That rota day is closed');
  await db.exec(migration('0179_restore_authorized_same_day_approvals.sql'));
});
afterAll(() => db.close());

async function reset() {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid','${manager}',false);
    SELECT set_config('bm.approved_rota_slot','',false);
    DELETE FROM shift_swap_requests; DELETE FROM shifts; DELETE FROM cover_requests; DELETE FROM shift_slots;`);
}
async function requestCover() {
  const result = await db.query<{ id: string }>(`INSERT INTO cover_requests(user_id,reason,cover_until)
    VALUES ('${requester}','Cover required','23:59:59') RETURNING id`);
  return result.rows[0]?.id;
}
async function requestSwap(dayOffset = 0) {
  const result = await db.query<{ id: string }>(`WITH slot AS (
    INSERT INTO shift_slots(shift_date,assigned_to,slot_type) VALUES
      ((now() AT TIME ZONE 'Europe/London')::date+1,'${requester}','shift') RETURNING id)
    INSERT INTO shift_swap_requests(slot_id,requester_id,target_user_id)
      SELECT id,'${requester}','${target}' FROM slot RETURNING id`);
  // Move the fixture before enabling assignments, without bypassing production approval guards.
  await db.exec(`ALTER TABLE shift_slots DISABLE TRIGGER guard_closed_rota_booking;
    UPDATE shift_slots SET shift_date=(now() AT TIME ZONE 'Europe/London')::date+${dayOffset};
    ALTER TABLE shift_slots ENABLE TRIGGER guard_closed_rota_booking;`);
  return result.rows[0]?.id;
}

test('management cover approval creates today’s slot and signs in atomically', async () => {
  await reset(); const id = await requestCover();
  await db.query('SELECT decide_cover_request($1,true)', [id]);
  const row = (await db.query<{ status: string; linked: boolean }>(`SELECT r.status,
    s.assigned_to=r.user_id AND s.shift_date=(now() AT TIME ZONE 'Europe/London')::date AND sh.user_id=r.user_id AS linked
    FROM cover_requests r JOIN shift_slots s ON s.id=r.slot_id JOIN shifts sh ON sh.id=r.shift_id`)).rows[0];
  expect(row).toEqual({ status: 'approved', linked: true });
  expect((await db.query<{ setting: string }>("SELECT current_setting('bm.approved_rota_slot',true) AS setting")).rows[0]?.setting).toBe('');
});
test('same-day swap moves the slot and commits the approved status', async () => {
  await reset(); const id = await requestSwap();
  await db.query('SELECT decide_shift_swap($1,true)', [id]);
  expect((await db.query(`SELECT r.status,s.assigned_to FROM shift_swap_requests r JOIN shift_slots s ON s.id=r.slot_id`)).rows[0])
    .toEqual({ status: 'approved', assigned_to: target });
});
test('failed duplicate-shift swap stays pending with the original assignment', async () => {
  await reset(); const id = await requestSwap();
  await db.exec(`ALTER TABLE shift_slots DISABLE TRIGGER guard_closed_rota_booking;
    INSERT INTO shift_slots(shift_date,assigned_to,slot_type) VALUES ((now() AT TIME ZONE 'Europe/London')::date,'${target}','shift');
    ALTER TABLE shift_slots ENABLE TRIGGER guard_closed_rota_booking;`);
  await expect(db.query('SELECT decide_shift_swap($1,true)', [id])).rejects.toThrow('You already have a shift booked that day');
  expect((await db.query(`SELECT r.status,s.assigned_to FROM shift_swap_requests r JOIN shift_slots s ON s.id=r.slot_id`)).rows[0])
    .toEqual({ status: 'pending', assigned_to: requester });
});
test('ordinary same-day bookings remain blocked even for management', async () => {
  await reset();
  await expect(db.exec(`INSERT INTO shift_slots(shift_date,assigned_to) VALUES ((now() AT TIME ZONE 'Europe/London')::date,'${requester}')`)).rejects.toThrow('That rota day is closed');
});
test('a caller cannot forge the single-slot approval exception', async () => {
  await reset();
  await db.exec('GRANT USAGE ON SCHEMA auth TO authenticated; GRANT SELECT ON shift_slots TO authenticated; GRANT INSERT ON shift_slots TO authenticated');
  const id = '00000000-0000-0000-0000-000000000099';
  await db.exec(`SET ROLE authenticated; SELECT set_config('bm.approved_rota_slot','${id}',false)`);
  try {
    await expect(db.exec(`INSERT INTO shift_slots(id,shift_date,assigned_to) VALUES ('${id}',(now() AT TIME ZONE 'Europe/London')::date,'${requester}')`)).rejects.toThrow('That rota day is closed');
  } finally { await db.exec('RESET ROLE'); }
});
test('staff cannot approve cover or swaps', async () => {
  await reset(); const cover = await requestCover(); const swap = await requestSwap();
  await db.exec(`SELECT set_config('test.uid','${requester}',false)`);
  await expect(db.query('SELECT decide_cover_request($1,true)', [cover])).rejects.toThrow('Only admin or management');
  await expect(db.query('SELECT decide_shift_swap($1,true)', [swap])).rejects.toThrow('Only admin or management');
});
test('past swaps stay pending and cannot use today’s exception', async () => {
  await reset(); const id = await requestSwap(-1);
  await expect(db.query('SELECT decide_shift_swap($1,true)', [id])).rejects.toThrow('Past shifts cannot be swapped');
  expect((await db.query(`SELECT status FROM shift_swap_requests`)).rows[0]?.status).toBe('pending');
});
test('a stale requester cannot transfer someone else’s shift', async () => {
  await reset(); const id = await requestSwap();
  await db.exec(`UPDATE shift_swap_requests SET requester_id='${target}'`);
  await expect(db.query('SELECT decide_shift_swap($1,true)', [id])).rejects.toThrow('The shift is no longer assigned to the requester');
});