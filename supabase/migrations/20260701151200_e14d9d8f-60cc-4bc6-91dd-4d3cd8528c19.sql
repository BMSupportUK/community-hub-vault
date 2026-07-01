delete from public.boro_fixtures
where not (
  home_team ~* 'middles?brough|boro'
  or away_team ~* 'middles?brough|boro'
);

update public.boro_match_centre
set
  next_fixture = (
    select jsonb_build_object(
      'kickoff', kickoff_at,
      'competition', coalesce(competition, 'Championship'),
      'home', home_team,
      'away', away_team,
      'venue', venue,
      'homeLogo', null,
      'awayLogo', null
    )
    from public.boro_fixtures
    where kickoff_at >= now()
      and coalesce(status, '') <> 'FINISHED'
      and (home_team ~* 'middles?brough|boro' or away_team ~* 'middles?brough|boro')
    order by kickoff_at asc
    limit 1
  ),
  fetched_at = null,
  updated_at = now()
where id = 'singleton'
  and (
    next_fixture is null
    or not (
      coalesce(next_fixture ->> 'home', '') ~* 'middles?brough|boro'
      or coalesce(next_fixture ->> 'away', '') ~* 'middles?brough|boro'
    )
  );