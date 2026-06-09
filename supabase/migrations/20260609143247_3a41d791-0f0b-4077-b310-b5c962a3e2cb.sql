
-- ============================================================
-- World Cup 2026 prediction competition
-- ============================================================

-- ---- wc_fixtures ------------------------------------------------
CREATE TABLE public.wc_fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL CHECK (stage IN ('group','r32','r16','qf','sf','third','final')),
  group_label text,
  home_team text NOT NULL,
  away_team text NOT NULL,
  kickoff_at timestamptz NOT NULL,
  home_score int,
  away_score int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_fixtures TO authenticated;
GRANT ALL ON public.wc_fixtures TO service_role;

ALTER TABLE public.wc_fixtures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wc_fixtures_select_auth" ON public.wc_fixtures
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "wc_fixtures_admin_insert" ON public.wc_fixtures
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));

CREATE POLICY "wc_fixtures_admin_update" ON public.wc_fixtures
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));

CREATE POLICY "wc_fixtures_admin_delete" ON public.wc_fixtures
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));

-- ---- wc_predictions ---------------------------------------------
CREATE TABLE public.wc_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fixture_id uuid NOT NULL REFERENCES public.wc_fixtures(id) ON DELETE CASCADE,
  home_pred int NOT NULL CHECK (home_pred >= 0 AND home_pred <= 30),
  away_pred int NOT NULL CHECK (away_pred >= 0 AND away_pred <= 30),
  points int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fixture_id)
);

CREATE INDEX wc_predictions_user_idx ON public.wc_predictions(user_id);
CREATE INDEX wc_predictions_fixture_idx ON public.wc_predictions(fixture_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_predictions TO authenticated;
GRANT ALL ON public.wc_predictions TO service_role;

ALTER TABLE public.wc_predictions ENABLE ROW LEVEL SECURITY;

-- User sees own predictions
CREATE POLICY "wc_predictions_select_own" ON public.wc_predictions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins/management see everything
CREATE POLICY "wc_predictions_select_admin" ON public.wc_predictions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));

-- Insert/update is constrained server-side (kickoff check); RLS just guards ownership + subscriber role
CREATE POLICY "wc_predictions_insert_own" ON public.wc_predictions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.has_role(auth.uid(),'subscriber') OR public.has_role(auth.uid(),'member'))
    AND EXISTS (SELECT 1 FROM public.wc_fixtures f WHERE f.id = fixture_id AND f.kickoff_at > now())
  );

CREATE POLICY "wc_predictions_update_own" ON public.wc_predictions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.wc_fixtures f WHERE f.id = fixture_id AND f.kickoff_at > now())
  );

CREATE POLICY "wc_predictions_delete_own" ON public.wc_predictions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ---- updated_at trigger -----------------------------------------
CREATE TRIGGER wc_fixtures_set_updated_at
  BEFORE UPDATE ON public.wc_fixtures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER wc_predictions_set_updated_at
  BEFORE UPDATE ON public.wc_predictions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- scoring helper --------------------------------------------
-- 5 pts exact, 3 pts correct result + correct goal diff, 1 pt correct result, 0 otherwise.
CREATE OR REPLACE FUNCTION public.wc_calc_points(
  hp int, ap int, hs int, as_ int
) RETURNS int
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN hp IS NULL OR ap IS NULL OR hs IS NULL OR as_ IS NULL THEN NULL
    WHEN hp = hs AND ap = as_ THEN 5
    WHEN sign(hp - ap) = sign(hs - as_) AND (hp - ap) = (hs - as_) THEN 3
    WHEN sign(hp - ap) = sign(hs - as_) THEN 1
    ELSE 0
  END;
$$;

-- Recompute points for every prediction on a fixture (call after admin sets the result)
CREATE OR REPLACE FUNCTION public.wc_score_fixture(_fixture_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hs int; as_ int;
BEGIN
  SELECT home_score, away_score INTO hs, as_
  FROM public.wc_fixtures WHERE id = _fixture_id;
  UPDATE public.wc_predictions
     SET points = public.wc_calc_points(home_pred, away_pred, hs, as_),
         updated_at = now()
   WHERE fixture_id = _fixture_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wc_score_fixture(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wc_score_fixture(uuid) TO service_role;

-- ---- leaderboard view -------------------------------------------
CREATE VIEW public.wc_leaderboard AS
SELECT
  p.user_id,
  pr.display_name,
  pr.username,
  pr.avatar_url,
  COALESCE(SUM(p.points), 0)::int                                  AS total_points,
  COUNT(*) FILTER (WHERE p.points = 5)::int                        AS exact_count,
  COUNT(*) FILTER (WHERE p.points IN (1,3))::int                   AS result_count,
  COUNT(*)::int                                                    AS predictions_made,
  COUNT(*) FILTER (WHERE p.points IS NOT NULL)::int                AS predictions_scored
FROM public.wc_predictions p
LEFT JOIN public.profiles pr ON pr.id = p.user_id
GROUP BY p.user_id, pr.display_name, pr.username, pr.avatar_url;

GRANT SELECT ON public.wc_leaderboard TO authenticated;
GRANT ALL ON public.wc_leaderboard TO service_role;

-- ---- seed 72 group-stage placeholder fixtures -------------------
DO $$
DECLARE
  groups text[] := ARRAY['A','B','C','D','E','F','G','H','I','J','K','L'];
  g text;
  group_idx int := 0;
  md int;
  m int;
  k timestamptz;
  home_team text;
  away_team text;
BEGIN
  FOREACH g IN ARRAY groups LOOP
    -- 3 matchdays per group, 2 matches per matchday
    FOR md IN 1..3 LOOP
      FOR m IN 1..2 LOOP
        -- spread matchdays across the tournament window 11–27 June 2026
        k := (DATE '2026-06-11' + ((md - 1) * 5) + (group_idx / 4))::timestamptz
             + (((group_idx % 4) * 3 + (m - 1)) || ' hours')::interval
             + interval '17 hours';
        IF md = 1 AND m = 1 THEN
          home_team := 'Group '||g||' Team 1'; away_team := 'Group '||g||' Team 2';
        ELSIF md = 1 AND m = 2 THEN
          home_team := 'Group '||g||' Team 3'; away_team := 'Group '||g||' Team 4';
        ELSIF md = 2 AND m = 1 THEN
          home_team := 'Group '||g||' Team 1'; away_team := 'Group '||g||' Team 3';
        ELSIF md = 2 AND m = 2 THEN
          home_team := 'Group '||g||' Team 4'; away_team := 'Group '||g||' Team 2';
        ELSIF md = 3 AND m = 1 THEN
          home_team := 'Group '||g||' Team 4'; away_team := 'Group '||g||' Team 1';
        ELSE
          home_team := 'Group '||g||' Team 2'; away_team := 'Group '||g||' Team 3';
        END IF;
        INSERT INTO public.wc_fixtures (stage, group_label, home_team, away_team, kickoff_at)
        VALUES ('group', g, home_team, away_team, k);
      END LOOP;
    END LOOP;
    group_idx := group_idx + 1;
  END LOOP;
END $$;
