
-- Break kind enum
do $$ begin
  create type public.break_kind as enum ('break', 'lunch');
exception when duplicate_object then null; end $$;

-- Shifts
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  created_at timestamptz not null default now()
);
create index shifts_user_active_idx on public.shifts(user_id) where clock_out is null;
create index shifts_user_idx on public.shifts(user_id, clock_in desc);

-- Breaks
create table public.breaks (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  user_id uuid not null,
  kind public.break_kind not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index breaks_shift_idx on public.breaks(shift_id);
create index breaks_active_idx on public.breaks(user_id) where ended_at is null;

alter table public.shifts enable row level security;
alter table public.breaks enable row level security;

-- Helper: any staff role
-- (uses existing has_any_role function)

-- shifts policies
create policy "Users view own shifts" on public.shifts
  for select using (auth.uid() = user_id);
create policy "Staff view all shifts" on public.shifts
  for select using (public.has_any_role(auth.uid(), array['admin','management','staff','moderator']::app_role[]));
create policy "Users insert own shifts" on public.shifts
  for insert with check (auth.uid() = user_id);
create policy "Users update own shifts" on public.shifts
  for update using (auth.uid() = user_id);

-- breaks policies
create policy "Users view own breaks" on public.breaks
  for select using (auth.uid() = user_id);
create policy "Staff view all breaks" on public.breaks
  for select using (public.has_any_role(auth.uid(), array['admin','management','staff','moderator']::app_role[]));
create policy "Users insert own breaks" on public.breaks
  for insert with check (auth.uid() = user_id);
create policy "Users update own breaks" on public.breaks
  for update using (auth.uid() = user_id);

-- realtime
alter publication supabase_realtime add table public.shifts;
alter publication supabase_realtime add table public.breaks;
