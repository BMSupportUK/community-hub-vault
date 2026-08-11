CREATE TABLE public.fantasy_scoring_rules (
  key text PRIMARY KEY,
  label text NOT NULL,
  stat_column text,
  per_n integer NOT NULL DEFAULT 1,
  points numeric NOT NULL DEFAULT 0,
  positions text[],
  special text,
  halves_for_subs boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fantasy_scoring_rules TO anon;
GRANT SELECT ON public.fantasy_scoring_rules TO authenticated;
GRANT ALL ON public.fantasy_scoring_rules TO service_role;

ALTER TABLE public.fantasy_scoring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view fantasy scoring rules"
  ON public.fantasy_scoring_rules FOR SELECT USING (true);

CREATE POLICY "Admins manage fantasy scoring rules"
  ON public.fantasy_scoring_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE TRIGGER fantasy_scoring_rules_updated_at
  BEFORE UPDATE ON public.fantasy_scoring_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.fantasy_scoring_rules (key, label, stat_column, per_n, points, positions, special, halves_for_subs, sort_order) VALUES
  ('appearance_start', 'Named in the match day 11 and features', NULL, 1, 2, NULL, 'appearance_start', false, 10),
  ('appearance_sub', 'Comes on from the bench', NULL, 1, 1, NULL, 'appearance_sub', false, 20),
  ('goal_gk_def', 'Goal (G) — goalkeeper or defender', 'goals', 1, 6, ARRAY['gk','def'], NULL, true, 30),
  ('goal_mid', 'Goal (G) — midfielder', 'goals', 1, 5, ARRAY['mid'], NULL, true, 40),
  ('goal_fwd', 'Goal (G) — forward', 'goals', 1, 4, ARRAY['fwd'], NULL, true, 50),
  ('assist', 'Assist (A)', 'assists', 1, 3, NULL, NULL, true, 60),
  ('clean_sheet_gk_def', 'Clean sheet (60+ mins) — goalkeeper or defender', NULL, 1, 4, ARRAY['gk','def'], 'clean_sheet', true, 70),
  ('clean_sheet_mid', 'Clean sheet (60+ mins) — midfielder', NULL, 1, 1, ARRAY['mid'], 'clean_sheet', true, 80),
  ('shots_on_target', 'Shot on goal that was not a goal (SOG)', NULL, 1, 1, NULL, 'shots_on_target_excl_goals', true, 90),
  ('shots', 'Every 3 shots (SHOT)', 'shots', 3, 1, NULL, NULL, true, 100),
  ('accurate_passes', 'Every 20 accurate passes (AC.PASS)', 'accurate_passes', 20, 1, NULL, NULL, true, 110),
  ('accurate_long_balls', 'Every 3 accurate long balls (AC.LONG)', 'accurate_long_balls', 3, 1, NULL, NULL, true, 120),
  ('big_chances_created', 'Big chance created (BCC)', 'big_chances_created', 1, 3, NULL, NULL, true, 130),
  ('big_chances_missed', 'Big chance missed (BCM)', 'big_chances_missed', 1, -2, NULL, NULL, true, 140),
  ('touches', 'Every 25 touches (TCH)', 'touches', 25, 1, NULL, NULL, true, 150),
  ('duels_won', 'Every 4 duels won (DUELW)', 'duels_won', 4, 1, NULL, NULL, true, 160),
  ('defensive_interventions', 'Every 3 defensive interventions (DINT)', 'defensive_interventions', 3, 1, NULL, NULL, true, 170),
  ('fouls_suffered', 'Every 3 fouls suffered (FA)', 'fouls_suffered', 3, 1, NULL, NULL, true, 180),
  ('fouls_committed', 'Every 3 fouls committed (FC)', 'fouls_committed', 3, -1, NULL, NULL, true, 190),
  ('saves', 'Every 3 saves (SV) — goalkeeper', 'saves', 3, 1, ARRAY['gk'], NULL, true, 200),
  ('shots_on_goal_against', 'Every 5 shots on goal against (SOGA) — goalkeeper', NULL, 5, 1, ARRAY['gk'], 'shots_on_goal_against', true, 210),
  ('crosses_claimed', 'Cross claimed (CC) — goalkeeper', 'crosses_claimed', 1, 1, ARRAY['gk'], NULL, true, 220),
  ('unclaimed_crosses', 'Unclaimed cross (UC) — goalkeeper', 'unclaimed_crosses', 1, -1, ARRAY['gk'], NULL, true, 230),
  ('keeper_sweepers', 'Keeper sweeper (KS) — goalkeeper', 'keeper_sweepers', 1, 1, ARRAY['gk'], NULL, true, 240),
  ('pens_saved', 'Penalty save', 'pens_saved', 1, 5, NULL, NULL, true, 250),
  ('pens_missed', 'Penalty miss', 'pens_missed', 1, -2, NULL, NULL, true, 260),
  ('goals_conceded', 'Every 2 goals conceded (GA) — goalkeeper or defender', 'goals_conceded', 2, -1, ARRAY['gk','def'], NULL, true, 270),
  ('yellows', 'Yellow card', 'yellows', 1, -1, NULL, NULL, true, 280),
  ('reds', 'Red card', 'reds', 1, -3, NULL, NULL, true, 290),
  ('own_goals', 'Own goal', 'own_goals', 1, -2, NULL, NULL, true, 300),
  ('bonus', 'Man of the match bonus (awarded by admin)', 'bonus', 1, 1, NULL, NULL, true, 310);

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