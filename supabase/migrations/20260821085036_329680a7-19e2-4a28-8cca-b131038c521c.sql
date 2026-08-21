-- collapse duplicate open shifts: keep the earliest open shift per user
with keep as (
  select distinct on (user_id) id, user_id
  from public.shifts
  where clock_out is null
  order by user_id, clock_in asc
), dupes as (
  select s.id from public.shifts s
  where s.clock_out is null
    and s.id not in (select id from keep)
)
delete from public.breaks b where b.shift_id in (select id from dupes);

with keep as (
  select distinct on (user_id) id, user_id
  from public.shifts
  where clock_out is null
  order by user_id, clock_in asc
)
delete from public.shifts s
where s.clock_out is null and s.id not in (select id from keep);

create unique index if not exists shifts_one_open_per_user
  on public.shifts (user_id) where clock_out is null;