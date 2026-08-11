-- Outfield-only actions
UPDATE public.fantasy_scoring_rules SET positions = ARRAY['def','mid','fwd']
 WHERE key IN ('assist','shots_on_target','shots','big_chances_created','big_chances_missed','defensive_interventions','duels_won');

-- Goalkeeper-only actions
UPDATE public.fantasy_scoring_rules SET positions = ARRAY['gk']
 WHERE key IN ('goals_conceded','saves','shots_on_goal_against','crosses_claimed','unclaimed_crosses','keeper_sweepers','accurate_long_balls');

-- Shared action
UPDATE public.fantasy_scoring_rules SET positions = NULL WHERE key = 'accurate_passes';

-- Total passes (PASS) for goalkeepers
INSERT INTO public.fantasy_scoring_rules (key, label, stat_column, per_n, points, positions, enabled, sort_order)
VALUES ('passes', 'Every 30 passes (PASS) — goalkeeper', 'passes', 30, 1, ARRAY['gk'], true, 245)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, stat_column = EXCLUDED.stat_column,
  per_n = EXCLUDED.per_n, points = EXCLUDED.points, positions = EXCLUDED.positions, enabled = true;

-- Everything else no longer scores
DELETE FROM public.fantasy_scoring_rules
 WHERE key IN ('goal_gk_def','goal_mid','goal_fwd','clean_sheet_gk_def','clean_sheet_mid','touches',
               'fouls_suffered','fouls_committed','pens_saved','pens_missed','yellows','reds','own_goals','bonus');

-- Re-score any locked/finished game weeks with the new rules
DO $$
DECLARE gw uuid;
BEGIN
  FOR gw IN SELECT id FROM public.fantasy_gameweeks WHERE status IN ('locked','final') LOOP
    PERFORM public.fantasy_score_gameweek(gw);
  END LOOP;
END $$;