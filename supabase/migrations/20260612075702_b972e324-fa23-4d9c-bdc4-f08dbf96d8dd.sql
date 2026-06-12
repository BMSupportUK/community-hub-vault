create table if not exists public.wc_prediction_reminders (
  entrant_kind text not null check (entrant_kind in ('user','guest')),
  entrant_id uuid not null,
  sent_date date not null,
  recipient_email text not null,
  created_at timestamptz not null default now(),
  primary key (entrant_kind, entrant_id, sent_date)
);

grant all on public.wc_prediction_reminders to service_role;
alter table public.wc_prediction_reminders enable row level security;

create policy "service role only"
  on public.wc_prediction_reminders
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.get_wc_reminder_recipients()
returns table (
  entrant_kind text,
  entrant_id uuid,
  recipient_email text,
  display_name text,
  missing_count int,
  next_kickoff_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with upcoming as (
    select id, kickoff_at
    from public.wc_fixtures
    where kickoff_at > now()
      and kickoff_at <= now() + interval '24 hours'
  ),
  user_missing as (
    select e.user_id as entrant_id,
           count(*)::int as missing_count,
           min(u.kickoff_at) as next_kickoff_at
    from public.wc_entrants e
    cross join upcoming u
    where not exists (
      select 1 from public.wc_predictions p
      where p.user_id = e.user_id and p.fixture_id = u.id
    )
    group by e.user_id
  ),
  guest_missing as (
    select g.id as entrant_id,
           count(*)::int as missing_count,
           min(u.kickoff_at) as next_kickoff_at
    from public.wc_guest_entrants g
    cross join upcoming u
    where g.email is not null
      and not exists (
        select 1 from public.wc_predictions p
        where p.guest_id = g.id and p.fixture_id = u.id
      )
    group by g.id
  )
  select 'user'::text,
         um.entrant_id,
         au.email::text,
         coalesce(pr.display_name, pr.username, split_part(au.email::text, '@', 1)),
         um.missing_count,
         um.next_kickoff_at
  from user_missing um
  join auth.users au on au.id = um.entrant_id
  left join public.profiles pr on pr.id = um.entrant_id
  where au.email is not null
  union all
  select 'guest'::text,
         gm.entrant_id,
         ge.email::text,
         coalesce(ge.display_name, split_part(ge.email::text, '@', 1)),
         gm.missing_count,
         gm.next_kickoff_at
  from guest_missing gm
  join public.wc_guest_entrants ge on ge.id = gm.entrant_id;
$$;

revoke all on function public.get_wc_reminder_recipients() from public, anon, authenticated;
grant execute on function public.get_wc_reminder_recipients() to service_role;