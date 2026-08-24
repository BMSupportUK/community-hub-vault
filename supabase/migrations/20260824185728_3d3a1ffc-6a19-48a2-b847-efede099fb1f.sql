CREATE OR REPLACE FUNCTION public.get_boro_reminder_recipients()
 RETURNS TABLE(entrant_kind text, entrant_id uuid, recipient_email text, display_name text, missing_count integer, next_kickoff_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  with upcoming as (
    select id, kickoff_at from public.boro_fixtures
    where competition = 'Championship'
      and kickoff_at > now() + interval '23 hours' and kickoff_at <= now() + interval '25 hours'
  ),
  user_missing as (
    select e.user_id as entrant_id, count(*)::int as missing_count, min(u.kickoff_at) as next_kickoff_at
    from public.boro_entrants e cross join upcoming u
    where not exists (select 1 from public.boro_predictions p where p.user_id = e.user_id and p.fixture_id = u.id)
    group by e.user_id
  ),
  guest_missing as (
    select g.id as entrant_id, count(*)::int as missing_count, min(u.kickoff_at) as next_kickoff_at
    from public.boro_guest_entrants g cross join upcoming u
    where g.email is not null
      and not exists (select 1 from public.boro_predictions p where p.guest_id = g.id and p.fixture_id = u.id)
    group by g.id
  )
  select 'user'::text, um.entrant_id, au.email::text,
         coalesce(pr.display_name, pr.username, split_part(au.email::text, '@', 1)),
         um.missing_count, um.next_kickoff_at
  from user_missing um
  join auth.users au on au.id = um.entrant_id
  left join public.profiles pr on pr.id = um.entrant_id
  where au.email is not null
  union all
  select 'guest'::text, gm.entrant_id, ge.email::text,
         coalesce(ge.display_name, split_part(ge.email::text, '@', 1)),
         gm.missing_count, gm.next_kickoff_at
  from guest_missing gm
  join public.boro_guest_entrants ge on ge.id = gm.entrant_id;
$function$;