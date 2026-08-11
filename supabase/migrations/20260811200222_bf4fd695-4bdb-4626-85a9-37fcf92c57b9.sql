UPDATE public.fantasy_scoring_rules
SET positions = ARRAY['gk', 'def', 'mid', 'fwd']
WHERE key = 'assist';

DO $$
DECLARE
  g RECORD;
BEGIN
  FOR g IN
    SELECT id, status
    FROM public.fantasy_gameweeks
    WHERE status IN ('locked', 'final')
  LOOP
    PERFORM public.fantasy_score_gameweek(g.id);
  END LOOP;
END
$$;