CREATE TABLE public.fantasy_squad_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrant_kind text NOT NULL CHECK (entrant_kind IN ('user','guest')),
  entrant_id uuid NOT NULL,
  sent_date date NOT NULL,
  recipient_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entrant_kind, entrant_id, sent_date)
);

GRANT ALL ON public.fantasy_squad_reminders TO service_role;

ALTER TABLE public.fantasy_squad_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view fantasy reminder log"
  ON public.fantasy_squad_reminders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE OR REPLACE FUNCTION public.get_fantasy_reminder_recipients()
RETURNS TABLE(entrant_kind text, entrant_id uuid, recipient_email text, display_name text, missing_count integer, next_kickoff_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  with upcoming as (
    select gw.id, f.kickoff_at
    from public.fantasy_gameweeks gw
    join public.boro_fixtures f on f.id = gw.fixture_id
    where gw.status = 'upcoming'
      and f.kickoff_at > now()
      and f.kickoff_at <= now() + interval '24 hours'
  ),
  user_missing as (
    select e.user_id as entrant_id, count(*)::int as missing_count, min(u.kickoff_at) as next_kickoff_at
    from public.fantasy_entrants e cross join upcoming u
    where not exists (
      select 1 from public.fantasy_squads s
      where s.user_id = e.user_id and s.gameweek_id = u.id
    )
    group by e.user_id
  ),
  guest_missing as (
    select g.id as entrant_id, count(*)::int as missing_count, min(u.kickoff_at) as next_kickoff_at
    from public.fantasy_guest_entrants g cross join upcoming u
    where g.email is not null
      and not exists (
        select 1 from public.fantasy_squads s
        where s.guest_id = g.id and s.gameweek_id = u.id
      )
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
  join public.fantasy_guest_entrants ge on ge.id = gm.entrant_id;
$function$;