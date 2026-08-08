CREATE OR REPLACE VIEW public.fantasy_leaderboard
WITH (security_invoker = on) AS
WITH entrants AS (
  SELECT fe.user_id AS user_id, NULL::uuid AS guest_id, fe.team_name AS team_name, NULL::text AS guest_display
  FROM public.fantasy_entrants fe
  UNION ALL
  SELECT NULL::uuid AS user_id, ge.id AS guest_id, ge.team_name AS team_name, ge.display_name AS guest_display
  FROM public.fantasy_guest_entrants ge
)
SELECT COALESCE(e.user_id, e.guest_id) AS entrant_id,
  e.guest_id IS NOT NULL AS is_guest,
  COALESCE(e.team_name, 'My Boro XI'::text) AS team_name,
  COALESCE(e.guest_display, pr.display_name, pr.username) AS display_name,
  pr.username,
  pr.avatar_url,
  COALESCE(sum(COALESCE(s.points, 0)), 0)::integer AS total_points,
  COALESCE(sum(COALESCE(s.transfer_cost, 0)), 0)::integer AS total_hits,
  count(s.id) FILTER (WHERE s.points IS NOT NULL)::integer AS gameweeks_scored,
  count(s.id)::integer AS squads_entered
FROM entrants e
  LEFT JOIN public.fantasy_squads s
    ON (e.user_id IS NOT NULL AND s.user_id = e.user_id)
    OR (e.guest_id IS NOT NULL AND s.guest_id = e.guest_id)
  LEFT JOIN public.profiles pr ON pr.id = e.user_id
GROUP BY COALESCE(e.user_id, e.guest_id), (e.guest_id IS NOT NULL), e.team_name, e.guest_display, pr.display_name, pr.username, pr.avatar_url;

GRANT SELECT ON public.fantasy_leaderboard TO authenticated;
GRANT SELECT ON public.fantasy_leaderboard TO anon;
GRANT ALL ON public.fantasy_leaderboard TO service_role;