INSERT INTO public.fantasy_scoring_rules (key, label, points, per_n, positions, stat_column, special, enabled, halves_for_subs, sort_order) VALUES
  ('goals_gk_def', 'Goal scored — goalkeeper or defender', 6, 1, ARRAY['gk','def'], 'goals', NULL, true, true, 30),
  ('goals_mid', 'Goal scored — midfielder', 5, 1, ARRAY['mid'], 'goals', NULL, true, true, 31),
  ('goals_fwd', 'Goal scored — forward', 4, 1, ARRAY['fwd'], 'goals', NULL, true, true, 32),
  ('clean_sheet_gk_def', 'Clean sheet (60+ mins) — goalkeeper or defender', 4, 1, ARRAY['gk','def'], NULL, 'clean_sheet', true, true, 40),
  ('clean_sheet_mid', 'Clean sheet (60+ mins) — midfielder', 1, 1, ARRAY['mid'], NULL, 'clean_sheet', true, true, 41),
  ('pens_saved', 'Penalty saved', 5, 1, ARRAY['gk'], 'pens_saved', NULL, true, true, 250),
  ('pens_missed', 'Penalty missed', -2, 1, NULL, 'pens_missed', NULL, true, true, 251),
  ('yellows', 'Yellow card', -1, 1, NULL, 'yellows', NULL, true, true, 280),
  ('reds', 'Red card', -3, 1, NULL, 'reds', NULL, true, true, 281),
  ('own_goals', 'Own goal', -2, 1, NULL, 'own_goals', NULL, true, true, 282),
  ('motm_bonus', 'Man of the match bonus', 1, 1, NULL, 'bonus', NULL, true, true, 300)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  points = EXCLUDED.points,
  per_n = EXCLUDED.per_n,
  positions = EXCLUDED.positions,
  stat_column = EXCLUDED.stat_column,
  special = EXCLUDED.special,
  enabled = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

DO $$
DECLARE g record;
BEGIN
    FOR g IN SELECT id FROM public.fantasy_gameweeks WHERE lock_at IS NOT NULL AND lock_at <= now() LOOP
    PERFORM public.fantasy_score_gameweek(g.id);
  END LOOP;
END $$;