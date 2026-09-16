DROP VIEW public.fantasy_leaderboard;

ALTER TABLE public.fantasy_player_stats
  ALTER COLUMN points TYPE numeric(10,2) USING points::numeric(10,2),
  ALTER COLUMN points SET DEFAULT 0;
ALTER TABLE public.fantasy_squad_picks
  ALTER COLUMN points TYPE numeric(10,2) USING points::numeric(10,2);
ALTER TABLE public.fantasy_squads
  ALTER COLUMN points TYPE numeric(10,2) USING points::numeric(10,2);

DROP FUNCTION public.fantasy_points_for(text, boolean, public.fantasy_player_stats);

CREATE FUNCTION public.fantasy_points_for(_pos text, _started boolean, s public.fantasy_player_stats)
RETURNS numeric
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

  RETURN app_pts + (CASE WHEN COALESCE(_started, true) THEN stat_pts ELSE stat_pts / 2.0 END);
END;
$function$;

REVOKE ALL ON FUNCTION public.fantasy_points_for(text, boolean, public.fantasy_player_stats) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fantasy_points_for(text, boolean, public.fantasy_player_stats) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fantasy_points_for(text, boolean, public.fantasy_player_stats) TO service_role;

CREATE OR REPLACE FUNCTION public.fantasy_score_gameweek(_gameweek_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fixture uuid;
  v_squad record;
  v_pick record;
  v_total numeric := 0;
  v_pts numeric := 0;
  v_cap_pts numeric := 0;
  v_cap_played boolean;
  v_vice_played boolean;
  v_subs_used int;
BEGIN
  SELECT fixture_id INTO v_fixture FROM fantasy_gameweeks WHERE id = _gameweek_id;
  IF v_fixture IS NULL THEN RETURN; END IF;

  UPDATE fantasy_player_stats s
     SET points = fantasy_points_for(p.position, true, s.*)
    FROM fantasy_players p
   WHERE p.id = s.player_id AND s.fixture_id = v_fixture;

  FOR v_squad IN SELECT * FROM fantasy_squads WHERE gameweek_id = _gameweek_id LOOP
    v_total := 0;
    v_subs_used := 0;
    v_cap_played := false;
    v_vice_played := false;
    v_cap_pts := 0;
    UPDATE fantasy_squad_picks SET points = NULL, auto_subbed = false WHERE squad_id = v_squad.id;

    FOR v_pick IN
      SELECT sp.id, sp.is_starter, sp.player_id,
             COALESCE(st.minutes,0) AS minutes,
             COALESCE(
               fantasy_points_for(COALESCE(sp.picked_position, p.position), sp.is_starter, st.*),
               0) AS pts
        FROM fantasy_squad_picks sp
        JOIN fantasy_players p ON p.id = sp.player_id
        LEFT JOIN fantasy_player_stats st ON st.player_id = sp.player_id AND st.fixture_id = v_fixture
       WHERE sp.squad_id = v_squad.id
       ORDER BY sp.is_starter DESC, COALESCE(st.minutes,0) DESC, sp.slot_order
    LOOP
      IF v_pick.minutes > 0 AND (v_pick.is_starter OR v_subs_used < 5) THEN
        IF NOT v_pick.is_starter THEN
          v_subs_used := v_subs_used + 1;
        END IF;
        v_pts := v_pick.pts;
        UPDATE fantasy_squad_picks
           SET points = v_pts, auto_subbed = (NOT v_pick.is_starter)
         WHERE id = v_pick.id;
        v_total := v_total + v_pts;
        IF v_squad.captain_id = v_pick.player_id THEN
          v_cap_played := true;
          v_cap_pts := v_pts;
        END IF;
        IF v_squad.vice_id = v_pick.player_id THEN
          v_vice_played := true;
        END IF;
      ELSE
        UPDATE fantasy_squad_picks SET points = 0 WHERE id = v_pick.id;
      END IF;
    END LOOP;

    IF v_cap_played THEN
      v_total := v_total + COALESCE(v_cap_pts,0);
    ELSIF v_vice_played THEN
      SELECT COALESCE(sp.points,0) INTO v_cap_pts
        FROM fantasy_squad_picks sp
       WHERE sp.squad_id = v_squad.id AND sp.player_id = v_squad.vice_id;
      v_total := v_total + COALESCE(v_cap_pts,0);
    END IF;

    v_total := v_total - COALESCE(v_squad.transfer_cost, 0);
    UPDATE fantasy_squads SET points = v_total WHERE id = v_squad.id;
  END LOOP;
END;
$function$;

CREATE VIEW public.fantasy_leaderboard
WITH (security_invoker = false) AS
WITH entrants AS (
  SELECT fe.user_id, NULL::uuid AS guest_id, fe.team_name, NULL::text AS guest_display
  FROM public.fantasy_entrants fe
  UNION ALL
  SELECT NULL::uuid AS user_id, ge.id AS guest_id, ge.team_name, ge.display_name AS guest_display
  FROM public.fantasy_guest_entrants ge
)
SELECT
  COALESCE(e.user_id, e.guest_id) AS entrant_id,
  (e.guest_id IS NOT NULL) AS is_guest,
  COALESCE(e.team_name, 'My Boro XI') AS team_name,
  COALESCE(e.guest_display, pr.display_name, pr.username) AS display_name,
  pr.username,
  pr.avatar_url,
  COALESCE(SUM(COALESCE(s.points, 0)), 0)::numeric(12,2) AS total_points,
  COALESCE(SUM(COALESCE(s.transfer_cost, 0)), 0)::integer AS total_hits,
  COUNT(s.id) FILTER (WHERE s.points IS NOT NULL)::integer AS gameweeks_scored,
  COUNT(s.id)::integer AS squads_entered
FROM entrants e
LEFT JOIN public.fantasy_squads s
  ON (e.user_id IS NOT NULL AND s.user_id = e.user_id)
  OR (e.guest_id IS NOT NULL AND s.guest_id = e.guest_id)
LEFT JOIN public.profiles pr ON pr.id = e.user_id
GROUP BY COALESCE(e.user_id, e.guest_id), (e.guest_id IS NOT NULL), e.team_name,
         e.guest_display, pr.display_name, pr.username, pr.avatar_url;

GRANT SELECT ON public.fantasy_leaderboard TO anon;
GRANT SELECT ON public.fantasy_leaderboard TO authenticated;
GRANT ALL ON public.fantasy_leaderboard TO service_role;