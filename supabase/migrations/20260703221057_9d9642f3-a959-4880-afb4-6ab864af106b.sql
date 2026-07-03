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
    count(*) FILTER (
      WHERE f.home_score IS NOT NULL
        AND f.away_score IS NOT NULL
        AND p.home_pred = f.home_score
        AND p.away_pred = f.away_score
    )::integer AS exact_count,
    count(*) FILTER (
      WHERE f.home_score IS NOT NULL
        AND f.away_score IS NOT NULL
        AND NOT (p.home_pred = f.home_score AND p.away_pred = f.away_score)
        AND sign(p.home_pred - p.away_pred) = sign(f.home_score - f.away_score)
        AND (p.home_pred - p.away_pred) = (f.home_score - f.away_score)
    )::integer AS goal_diff_count,
    count(*) FILTER (
      WHERE f.home_score IS NOT NULL
        AND f.away_score IS NOT NULL
        AND NOT (p.home_pred = f.home_score AND p.away_pred = f.away_score)
        AND NOT (
          sign(p.home_pred - p.away_pred) = sign(f.home_score - f.away_score)
          AND (p.home_pred - p.away_pred) = (f.home_score - f.away_score)
        )
        AND sign(p.home_pred - p.away_pred) = sign(f.home_score - f.away_score)
    )::integer AS result_count,
    count(*) FILTER (
      WHERE f.pen_winner IS NOT NULL
        AND p.home_pred = p.away_pred
        AND p.pen_winner_pred = f.pen_winner
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