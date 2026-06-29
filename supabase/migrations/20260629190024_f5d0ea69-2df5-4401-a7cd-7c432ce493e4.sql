ALTER TABLE public.wc_predictions
  ADD COLUMN IF NOT EXISTS pen_winner_pred text
    CHECK (pen_winner_pred IS NULL OR pen_winner_pred IN ('home','away'));

-- Bonus logic:
--   If the fixture went to pens (pen_winner set), award +1 when the user picked
--   the winning side. The pick is taken from the predicted scoreline when it
--   has a clear winner, otherwise from pen_winner_pred (only meaningful for a
--   draw prediction).
CREATE OR REPLACE FUNCTION public.wc_calc_points(
  hp int, ap int, hs int, as_ int,
  pen_winner text DEFAULT NULL,
  pen_winner_pred text DEFAULT NULL
) RETURNS int
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN hp IS NULL OR ap IS NULL OR hs IS NULL OR as_ IS NULL THEN NULL
    ELSE
      (CASE
        WHEN hp = hs AND ap = as_ THEN 5
        WHEN sign(hp - ap) = sign(hs - as_) AND (hp - ap) = (hs - as_) THEN 3
        WHEN sign(hp - ap) = sign(hs - as_) THEN 1
        ELSE 0
      END)
      +
      (CASE
        WHEN pen_winner IS NULL THEN 0
        -- explicit pen pick used only when scoreline is a draw
        WHEN hp = ap AND pen_winner_pred = pen_winner THEN 1
        -- otherwise the predicted scoreline's winning side counts
        WHEN hp <> ap AND pen_winner = 'home' AND hp > ap THEN 1
        WHEN hp <> ap AND pen_winner = 'away' AND ap > hp THEN 1
        ELSE 0
      END)
  END
$$;

CREATE OR REPLACE FUNCTION public.wc_score_fixture(_fixture_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hs int; as_ int; pw text;
BEGIN
  SELECT home_score, away_score, pen_winner INTO hs, as_, pw
  FROM public.wc_fixtures WHERE id = _fixture_id;
  IF hs IS NULL OR as_ IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.wc_predictions
     SET points = public.wc_calc_points(home_pred, away_pred, hs, as_, pw, pen_winner_pred),
         updated_at = now()
   WHERE fixture_id = _fixture_id;
END;
$function$;

-- Leaderboard pen_win_count: any pens-decided fixture where the user backed
-- the winning side (via scoreline or explicit pen pick).
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
    count(*) FILTER (WHERE p.points = 1)::integer AS result_count,
    count(*) FILTER (
      WHERE f.pen_winner IS NOT NULL
        AND (
          (p.home_pred = p.away_pred AND p.pen_winner_pred = f.pen_winner)
          OR (p.home_pred <> p.away_pred AND f.pen_winner = 'home' AND p.home_pred > p.away_pred)
          OR (p.home_pred <> p.away_pred AND f.pen_winner = 'away' AND p.away_pred > p.home_pred)
        )
    )::integer AS pen_win_count,
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

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.wc_fixtures WHERE home_score IS NOT NULL AND away_score IS NOT NULL LOOP
    PERFORM public.wc_score_fixture(r.id);
  END LOOP;
END$$;