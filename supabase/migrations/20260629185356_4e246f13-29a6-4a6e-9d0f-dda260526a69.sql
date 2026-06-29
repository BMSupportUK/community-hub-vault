-- New rule:
-- * If pen_winner IS NULL  -> standard scoring on the recorded scoreline
--   (covers regulation wins AND extra-time wins; the recorded score should
--    be the post-ET final score in the ET case).
-- * If pen_winner IS NOT NULL -> ignore the scoreline scoring entirely;
--   award exactly 1 point to predictions that picked the winning team
--   (i.e. predicted scoreline had the same winning side as pen_winner).
--   All other predictions for that fixture get 0.
CREATE OR REPLACE FUNCTION public.wc_calc_points(
  hp int, ap int, hs int, as_ int, pen_winner text DEFAULT NULL
) RETURNS int
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN hp IS NULL OR ap IS NULL OR hs IS NULL OR as_ IS NULL THEN NULL
    WHEN pen_winner = 'home' THEN CASE WHEN hp > ap THEN 1 ELSE 0 END
    WHEN pen_winner = 'away' THEN CASE WHEN ap > hp THEN 1 ELSE 0 END
    WHEN hp = hs AND ap = as_ THEN 5
    WHEN sign(hp - ap) = sign(hs - as_) AND (hp - ap) = (hs - as_) THEN 3
    WHEN sign(hp - ap) = sign(hs - as_) THEN 1
    ELSE 0
  END
$$;

-- Leaderboard: split the "1 pt" bucket so pen-shootout wins are counted
-- separately from regulation correct-result picks.
DROP VIEW IF EXISTS public.wc_leaderboard;
CREATE VIEW public.wc_leaderboard
WITH (security_invoker = true)
AS
SELECT COALESCE(p.user_id, p.guest_id) AS user_id,
    COALESCE(pr.display_name, ge.display_name) AS display_name,
    pr.username,
    pr.avatar_url,
    p.guest_id IS NOT NULL AS is_guest,
    COALESCE(sum(p.points), 0::bigint)::integer AS total_points,
    count(*) FILTER (WHERE p.points = 5)::integer AS exact_count,
    count(*) FILTER (WHERE p.points = 3)::integer AS goal_diff_count,
    count(*) FILTER (WHERE p.points = 1 AND f.pen_winner IS NULL)::integer AS result_count,
    count(*) FILTER (WHERE p.points = 1 AND f.pen_winner IS NOT NULL)::integer AS pen_win_count,
    count(*)::integer AS predictions_made,
    count(*) FILTER (WHERE p.points IS NOT NULL)::integer AS predictions_scored
   FROM public.wc_predictions p
     LEFT JOIN public.wc_fixtures f ON f.id = p.fixture_id
     LEFT JOIN public.profiles pr ON pr.id = p.user_id
     LEFT JOIN public.wc_guest_entrants ge ON ge.id = p.guest_id
  GROUP BY COALESCE(p.user_id, p.guest_id), pr.display_name, ge.display_name, pr.username, pr.avatar_url, (p.guest_id IS NOT NULL);

GRANT SELECT ON public.wc_leaderboard TO authenticated;
GRANT SELECT ON public.wc_leaderboard TO anon;
GRANT ALL ON public.wc_leaderboard TO service_role;

-- Re-score every finished fixture under the new rules.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.wc_fixtures WHERE home_score IS NOT NULL AND away_score IS NOT NULL LOOP
    PERFORM public.wc_score_fixture(r.id);
  END LOOP;
END$$;