CREATE OR REPLACE FUNCTION public.get_boro_final_reminder_recipients()
 RETURNS TABLE(entrant_kind text, entrant_id uuid, recipient_email text, display_name text, fixture_id uuid, fixture_label text, kickoff_at timestamptz, lock_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  with upcoming as (
    select id, kickoff_at, (home_team || ' v ' || away_team) as fixture_label
    from public.boro_fixtures
    where competition = 'Championship'
      and coalesce(date_tbc, false) = false
      and kickoff_at > now() + interval '90 minutes'
      and kickoff_at <= now() + interval '150 minutes'
  )
  select 'user'::text, e.user_id, au.email::text,
         coalesce(pr.display_name, pr.username, split_part(au.email::text,'@',1)),
         u.id, u.fixture_label, u.kickoff_at, u.kickoff_at - interval '30 minutes'
  from public.boro_entrants e
  cross join upcoming u
  join auth.users au on au.id = e.user_id
  left join public.profiles pr on pr.id = e.user_id
  where au.email is not null
    and not exists (select 1 from public.boro_predictions p where p.user_id = e.user_id and p.fixture_id = u.id)
  union all
  select 'guest'::text, g.id, g.email::text,
         coalesce(g.display_name, split_part(g.email::text,'@',1)),
         u.id, u.fixture_label, u.kickoff_at, u.kickoff_at - interval '30 minutes'
  from public.boro_guest_entrants g
  cross join upcoming u
  where g.email is not null
    and not exists (select 1 from public.boro_predictions p where p.guest_id = g.id and p.fixture_id = u.id);
$function$;

CREATE OR REPLACE FUNCTION public.get_fantasy_final_reminder_recipients()
 RETURNS TABLE(entrant_kind text, entrant_id uuid, recipient_email text, display_name text, gameweek_id uuid, gw_number integer, fixture_label text, kickoff_at timestamptz, lock_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  with upcoming as (
    select gw.id, gw.gw_number, gw.lock_at, f.kickoff_at,
           (f.home_team || ' v ' || f.away_team) as fixture_label
    from public.fantasy_gameweeks gw
    join public.boro_fixtures f on f.id = gw.fixture_id
    where gw.status = 'upcoming'
      and coalesce(f.date_tbc, false) = false
      and gw.lock_at > now() + interval '60 minutes'
      and gw.lock_at <= now() + interval '120 minutes'
  )
  select 'user'::text, e.user_id, au.email::text,
         coalesce(pr.display_name, pr.username, split_part(au.email::text,'@',1)),
         u.id, u.gw_number, u.fixture_label, u.kickoff_at, u.lock_at
  from public.fantasy_entrants e
  cross join upcoming u
  join auth.users au on au.id = e.user_id
  left join public.profiles pr on pr.id = e.user_id
  where au.email is not null
    and not exists (
      select 1 from public.fantasy_squads s
      where s.user_id = e.user_id and s.gameweek_id = u.id
        and exists (select 1 from public.fantasy_squad_picks p where p.squad_id = s.id)
    )
  union all
  select 'guest'::text, g.id, g.email::text,
         coalesce(g.display_name, split_part(g.email::text,'@',1)),
         u.id, u.gw_number, u.fixture_label, u.kickoff_at, u.lock_at
  from public.fantasy_guest_entrants g
  cross join upcoming u
  where g.email is not null
    and not exists (
      select 1 from public.fantasy_squads s
      where s.guest_id = g.id and s.gameweek_id = u.id
        and exists (select 1 from public.fantasy_squad_picks p where p.squad_id = s.id)
    );
$function$;

REVOKE ALL ON FUNCTION public.get_boro_final_reminder_recipients() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_fantasy_final_reminder_recipients() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_boro_final_reminder_recipients() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_fantasy_final_reminder_recipients() TO service_role;