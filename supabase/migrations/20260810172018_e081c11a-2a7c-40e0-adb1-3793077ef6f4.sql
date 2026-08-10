UPDATE public.fantasy_gameweeks g
SET lock_at = f.kickoff_at - interval '2 hours', updated_at = now()
FROM public.boro_fixtures f
WHERE f.id = g.fixture_id AND f.kickoff_at > now();