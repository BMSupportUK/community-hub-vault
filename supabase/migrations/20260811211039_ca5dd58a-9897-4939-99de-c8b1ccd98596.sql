INSERT INTO public.fantasy_scoring_rules (key, label, stat_column, per_n, points, positions, special, halves_for_subs, enabled, sort_order)
VALUES
  ('clean_sheet_short_gk_def', 'Clean sheet (under 60 mins) — goalkeeper or defender', NULL, 1, 2, ARRAY['gk','def']::text[], 'clean_sheet_short', true, true, 42),
  ('clean_sheet_short_mid', 'Clean sheet (under 60 mins) — midfielder', NULL, 1, 0.5, ARRAY['mid']::text[], 'clean_sheet_short', true, true, 43)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, points = EXCLUDED.points, positions = EXCLUDED.positions, special = EXCLUDED.special, enabled = true, sort_order = EXCLUDED.sort_order, updated_at = now();

CREATE OR REPLACE FUNCTION public.fantasy_points_for(_pos text, _started boolean, s fantasy_player_stats)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  j jsonb;
  raw numeric;
  stat_pts numeric := 0;
  app_pts numeric := 0;
BEGIN
  IF COALESCE(s.minutes, 0) <= 0 THEN RETURN 0; END IF;
  j := to_jsonb(s);

  FOR r IN
    SELECT * FROM fantasy_scoring_rules
     WHERE enabled AND (positions IS NULL OR _pos = ANY(positions))
  LOOP
    IF r.special = 'appearance_start' THEN
      IF COALESCE(_started, true) THEN app_pts := app_pts + r.points; END IF;
    ELSIF r.special = 'appearance_sub' THEN
      IF NOT COALESCE(_started, true) THEN app_pts := app_pts + r.points; END IF;
    ELSIF r.special = 'clean_sheet' THEN
      IF COALESCE(s.goals_conceded, 0) = 0 AND COALESCE(s.minutes, 0) >= 60 THEN
        stat_pts := stat_pts + r.points;
      END IF;
    ELSIF r.special = 'clean_sheet_short' THEN
      IF COALESCE(s.goals_conceded, 0) = 0 AND COALESCE(s.minutes, 0) > 0 AND COALESCE(s.minutes, 0) < 60 THEN
        stat_pts := stat_pts + r.points;
      END IF;
    ELSIF r.special = 'shots_on_target_excl_goals' THEN
      stat_pts := stat_pts
        + FLOOR(GREATEST(COALESCE(s.shots_on_target, 0) - COALESCE(s.goals, 0), 0) / GREATEST(r.per_n, 1)) * r.points;
    ELSIF r.special = 'shots_on_goal_against' THEN
      stat_pts := stat_pts
        + FLOOR(GREATEST(COALESCE(s.shots_on_goal_against, 0), COALESCE(s.shots_faced, 0)) / GREATEST(r.per_n, 1)) * r.points;
    ELSIF r.stat_column IS NOT NULL THEN
      raw := COALESCE((j ->> r.stat_column)::numeric, 0);
      stat_pts := stat_pts + FLOOR(raw / GREATEST(r.per_n, 1)) * r.points;
    END IF;
  END LOOP;

  RETURN ROUND(app_pts + (CASE WHEN COALESCE(_started, true) THEN stat_pts ELSE stat_pts / 2.0 END))::int;
END;
$function$;