DROP FUNCTION IF EXISTS public.get_fantasy_reminder_recipients();

CREATE OR REPLACE FUNCTION public.get_fantasy_reminder_recipients()
RETURNS TABLE(
  entrant_kind text,
  entrant_id uuid,
  recipient_email text,
  display_name text,
  missing_count integer,
  next_kickoff_at timestamp with time zone,
  gameweek_id uuid,
  gw_number integer,
  fixture_label text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  with upcoming as (
    select gw.id, gw.gw_number, f.kickoff_at,
           (f.home_team || ' v ' || f.away_team) as fixture_label
    from public.fantasy_gameweeks gw
    join public.boro_fixtures f on f.id = gw.fixture_id
    where gw.status = 'upcoming'
      and f.kickoff_at > now() + interval '23 hours'
      and f.kickoff_at <= now() + interval '25 hours'
  ),
  user_missing as (
    select e.user_id as entrant_id, count(*)::int as missing_count,
           min(u.kickoff_at) as next_kickoff_at,
           (array_agg(u.id order by u.kickoff_at))[1] as gameweek_id,
           (array_agg(u.gw_number order by u.kickoff_at))[1] as gw_number,
           (array_agg(u.fixture_label order by u.kickoff_at))[1] as fixture_label
    from public.fantasy_entrants e cross join upcoming u
    where not exists (
      select 1 from public.fantasy_squads s
      where s.user_id = e.user_id and s.gameweek_id = u.id
        and exists (select 1 from public.fantasy_squad_picks p where p.squad_id = s.id)
    )
    group by e.user_id
  ),
  guest_missing as (
    select g.id as entrant_id, count(*)::int as missing_count,
           min(u.kickoff_at) as next_kickoff_at,
           (array_agg(u.id order by u.kickoff_at))[1] as gameweek_id,
           (array_agg(u.gw_number order by u.kickoff_at))[1] as gw_number,
           (array_agg(u.fixture_label order by u.kickoff_at))[1] as fixture_label
    from public.fantasy_guest_entrants g cross join upcoming u
    where g.email is not null
      and not exists (
        select 1 from public.fantasy_squads s
        where s.guest_id = g.id and s.gameweek_id = u.id
          and exists (select 1 from public.fantasy_squad_picks p where p.squad_id = s.id)
      )
    group by g.id
  )
  select 'user'::text, um.entrant_id, au.email::text,
         coalesce(pr.display_name, pr.username, split_part(au.email::text, '@', 1)),
         um.missing_count, um.next_kickoff_at, um.gameweek_id, um.gw_number, um.fixture_label
  from user_missing um
  join auth.users au on au.id = um.entrant_id
  left join public.profiles pr on pr.id = um.entrant_id
  where au.email is not null
  union all
  select 'guest'::text, gm.entrant_id, ge.email::text,
         coalesce(ge.display_name, split_part(ge.email::text, '@', 1)),
         gm.missing_count, gm.next_kickoff_at, gm.gameweek_id, gm.gw_number, gm.fixture_label
  from guest_missing gm
  join public.fantasy_guest_entrants ge on ge.id = gm.entrant_id;
$function$;