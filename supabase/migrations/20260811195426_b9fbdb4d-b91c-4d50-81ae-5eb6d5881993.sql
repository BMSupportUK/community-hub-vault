UPDATE public.fantasy_scoring_rules SET per_n = 1, label = 'Every defensive intervention (DINT)' WHERE key = 'defensive_interventions';
UPDATE public.fantasy_scoring_rules SET per_n = 1, label = 'Every save (SV) — goalkeeper' WHERE key = 'saves';
UPDATE public.fantasy_scoring_rules SET per_n = 1, label = 'Every accurate long ball (AC.LONG) — goalkeeper' WHERE key = 'accurate_long_balls';
UPDATE public.fantasy_scoring_rules SET per_n = 1, label = 'Every shot (SHOT)' WHERE key = 'shots';
UPDATE public.fantasy_scoring_rules SET per_n = 1, label = 'Every duel won (DUELW)' WHERE key = 'duels_won';
UPDATE public.fantasy_scoring_rules SET per_n = 1, label = 'Every shot on goal against (SOGA) — goalkeeper' WHERE key = 'shots_on_goal_against';
UPDATE public.fantasy_scoring_rules SET per_n = 1, label = 'Every goal conceded (GA) — goalkeeper' WHERE key = 'goals_conceded';
UPDATE public.fantasy_scoring_rules SET per_n = 1, label = 'Every pass (PASS) — goalkeeper' WHERE key = 'passes';
UPDATE public.fantasy_scoring_rules SET per_n = 1, label = 'Every accurate pass (AC.PASS)' WHERE key = 'accurate_passes';

DO $$
DECLARE
  g record;
BEGIN
  FOR g IN SELECT id FROM public.fantasy_gameweeks WHERE status IN ('locked', 'final')
  LOOP
    PERFORM public.fantasy_score_gameweek(_gameweek_id => g.id);
  END LOOP;
END
$$;