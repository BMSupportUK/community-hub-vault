DROP VIEW IF EXISTS public.wc_leaderboard;

CREATE VIEW public.wc_leaderboard
WITH (security_invoker = on) AS
SELECT
  COALESCE(p.user_id, p.guest_id) AS user_id,
  COALESCE(pr.display_name, ge.display_name) AS display_name,
  pr.username,
  pr.avatar_url,
  p.guest_id IS NOT NULL AS is_guest,
  COALESCE(sum(p.points), 0)::integer AS total_points,
  count(*) FILTER (WHERE p.points = 5)::integer AS exact_count,
  count(*) FILTER (WHERE p.points = 3)::integer AS goal_diff_count,
  count(*) FILTER (WHERE p.points = 1)::integer AS result_count,
  count(*)::integer AS predictions_made,
  count(*) FILTER (WHERE p.points IS NOT NULL)::integer AS predictions_scored
FROM public.wc_predictions p
LEFT JOIN public.profiles pr ON pr.id = p.user_id
LEFT JOIN public.wc_guest_entrants ge ON ge.id = p.guest_id
GROUP BY COALESCE(p.user_id, p.guest_id), pr.display_name, ge.display_name, pr.username, pr.avatar_url, (p.guest_id IS NOT NULL);

GRANT SELECT ON public.wc_leaderboard TO authenticated, anon, service_role;