CREATE OR REPLACE VIEW public.boro_leaderboard AS
WITH entrants AS (
  SELECT e.user_id AS entrant_id,
         pr.display_name,
         pr.username,
         pr.avatar_url,
         FALSE AS is_guest
  FROM public.boro_entrants e
  LEFT JOIN public.profiles pr ON pr.id = e.user_id
  UNION ALL
  SELECT ge.id AS entrant_id,
         ge.display_name,
         NULL::text AS username,
         NULL::text AS avatar_url,
         TRUE AS is_guest
  FROM public.boro_guest_entrants ge
),
stats AS (
  SELECT COALESCE(p.user_id, p.guest_id) AS entrant_id,
         COALESCE(SUM(p.points), 0)::int AS total_points,
         COUNT(*) FILTER (WHERE p.points = 5)::int AS exact_count,
         COUNT(*) FILTER (WHERE p.points = 3)::int AS goal_diff_count,
         COUNT(*) FILTER (WHERE p.points = 1)::int AS result_count,
         COUNT(*)::int AS predictions_made,
         COUNT(*) FILTER (WHERE p.points IS NOT NULL)::int AS predictions_scored
  FROM public.boro_predictions p
  GROUP BY COALESCE(p.user_id, p.guest_id)
)
SELECT e.entrant_id AS user_id,
       e.display_name,
       e.username,
       e.avatar_url,
       e.is_guest,
       COALESCE(s.total_points, 0) AS total_points,
       COALESCE(s.exact_count, 0) AS exact_count,
       COALESCE(s.goal_diff_count, 0) AS goal_diff_count,
       COALESCE(s.result_count, 0) AS result_count,
       COALESCE(s.predictions_made, 0) AS predictions_made,
       COALESCE(s.predictions_scored, 0) AS predictions_scored
FROM entrants e
LEFT JOIN stats s ON s.entrant_id = e.entrant_id;

GRANT SELECT ON public.boro_leaderboard TO anon, authenticated, service_role;