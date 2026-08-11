ALTER TABLE public.fantasy_player_stats
  ADD COLUMN IF NOT EXISTS accurate_long_balls integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accurate_passes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pass_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS big_chances_created integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS big_chances_missed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crosses_claimed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unclaimed_crosses integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defensive_interventions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duels_won integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS keeper_sweepers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shots_on_goal_against integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS touches integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.fantasy_points_for(_pos text, _started boolean, s public.fantasy_player_stats)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH v AS (
    SELECT
      COALESCE(s.minutes,0) AS mins,
      COALESCE(s.goals,0) AS goals,
      (
        COALESCE(s.goals,0) * (CASE WHEN _pos IN ('gk','def') THEN 6 WHEN _pos = 'mid' THEN 5 ELSE 4 END)
        + COALESCE(s.assists,0) * 3
        + (CASE WHEN COALESCE(s.goals_conceded,0) = 0 AND COALESCE(s.minutes,0) >= 60 AND _pos IN ('gk','def') THEN 4
                WHEN COALESCE(s.goals_conceded,0) = 0 AND COALESCE(s.minutes,0) >= 60 AND _pos = 'mid' THEN 1
                ELSE 0 END)
        + COALESCE(s.pens_saved,0) * 5
        - COALESCE(s.pens_missed,0) * 2
        - (CASE WHEN _pos IN ('gk','def') THEN FLOOR(COALESCE(s.goals_conceded,0) / 2.0)::int ELSE 0 END)
        - COALESCE(s.yellows,0)
        - COALESCE(s.reds,0) * 3
        - COALESCE(s.own_goals,0) * 2
        -- ESPN match report player stats
        + GREATEST(COALESCE(s.shots_on_target,0) - COALESCE(s.goals,0), 0)
        + FLOOR(COALESCE(s.shots,0) / 3.0)::int
        + FLOOR(COALESCE(s.accurate_passes,0) / 20.0)::int
        + (CASE WHEN COALESCE(s.passes,0) >= 20 AND COALESCE(s.pass_pct,0) >= 85 THEN 2
                WHEN COALESCE(s.passes,0) >= 20 AND COALESCE(s.pass_pct,0) >= 75 THEN 1
                ELSE 0 END)
        + FLOOR(COALESCE(s.accurate_long_balls,0) / 3.0)::int
        + COALESCE(s.big_chances_created,0) * 3
        - COALESCE(s.big_chances_missed,0) * 2
        + FLOOR(COALESCE(s.defensive_interventions,0) / 3.0)::int
        + FLOOR(COALESCE(s.duels_won,0) / 4.0)::int
        + FLOOR(COALESCE(s.touches,0) / 25.0)::int
        + (CASE WHEN _pos = 'gk' THEN FLOOR(COALESCE(s.saves,0) / 3.0)::int ELSE 0 END)
        + (CASE WHEN _pos = 'gk' THEN COALESCE(s.crosses_claimed,0) ELSE 0 END)
        - (CASE WHEN _pos = 'gk' THEN COALESCE(s.unclaimed_crosses,0) ELSE 0 END)
        + (CASE WHEN _pos = 'gk' THEN COALESCE(s.keeper_sweepers,0) ELSE 0 END)
        + (CASE WHEN _pos = 'gk' THEN FLOOR(GREATEST(COALESCE(s.shots_on_goal_against,0), COALESCE(s.shots_faced,0)) / 5.0)::int ELSE 0 END)
        + FLOOR(COALESCE(s.fouls_suffered,0) / 3.0)::int
        - FLOOR(COALESCE(s.fouls_committed,0) / 3.0)::int
        - FLOOR(COALESCE(s.offsides,0) / 2.0)::int
        + COALESCE(s.bonus,0)
      ) AS stat_pts
  )
  SELECT CASE WHEN v.mins <= 0 THEN 0 ELSE
    (CASE WHEN COALESCE(_started, true) THEN 2 ELSE 1 END)
    + (CASE WHEN COALESCE(_started, true) THEN v.stat_pts ELSE ROUND(v.stat_pts / 2.0)::int END)
  END
  FROM v;
$function$;

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
  v_total int;
  v_pts int;
  v_cap_pts int;
  v_cap_played boolean;
  v_vice_played boolean;
BEGIN
  SELECT fixture_id INTO v_fixture FROM fantasy_gameweeks WHERE id = _gameweek_id;
  IF v_fixture IS NULL THEN RETURN; END IF;

  UPDATE fantasy_player_stats s
     SET points = fantasy_points_for(p.position, (COALESCE(s.minutes,0) >= 60), s.*)
    FROM fantasy_players p
   WHERE p.id = s.player_id AND s.fixture_id = v_fixture;

  FOR v_squad IN SELECT * FROM fantasy_squads WHERE gameweek_id = _gameweek_id LOOP
    v_total := 0;
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
       ORDER BY sp.is_starter DESC, sp.slot_order
    LOOP
      IF v_pick.minutes > 0 THEN
        v_pts := v_pick.pts;
        UPDATE fantasy_squad_picks
           SET points = v_pts, auto_subbed = (NOT v_pick.is_starter)
         WHERE id = v_pick.id;
        v_total := v_total + v_pts;
        IF v_squad.captain_id = v_pick.player_id THEN
          v_cap_played := true;
          v_cap_pts := v_pts;
        END IF;
        IF v_squad.vice_captain_id = v_pick.player_id THEN
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
       WHERE sp.squad_id = v_squad.id AND sp.player_id = v_squad.vice_captain_id;
      v_total := v_total + COALESCE(v_cap_pts,0);
    END IF;

    UPDATE fantasy_squads SET points = v_total WHERE id = v_squad.id;
    v_cap_played := false;
    v_vice_played := false;
    v_cap_pts := 0;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.fantasy_points_for(text, boolean, public.fantasy_player_stats) FROM anon;
GRANT EXECUTE ON FUNCTION public.fantasy_points_for(text, boolean, public.fantasy_player_stats) TO authenticated, service_role;