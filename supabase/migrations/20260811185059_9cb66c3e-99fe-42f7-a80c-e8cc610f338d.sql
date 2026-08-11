CREATE OR REPLACE FUNCTION public.fantasy_calc_points(_pos text, _minutes integer, _goals integer, _assists integer, _saves integer, _pens_saved integer, _pens_missed integer, _conceded integer, _yellows integer, _reds integer, _own_goals integer, _bonus integer, _shots_on_target integer DEFAULT 0, _shots integer DEFAULT 0, _shots_faced integer DEFAULT 0, _fouls_committed integer DEFAULT 0, _fouls_suffered integer DEFAULT 0, _offsides integer DEFAULT 0, _started boolean DEFAULT true)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN COALESCE(_minutes,0) <= 0 THEN 0 ELSE
      (CASE WHEN COALESCE(_started, true) THEN 2 ELSE 1 END)
    + COALESCE(_goals,0) * (CASE WHEN _pos IN ('gk','def') THEN 6 WHEN _pos = 'mid' THEN 5 ELSE 4 END)
    + COALESCE(_assists,0) * 3
    + (CASE WHEN COALESCE(_conceded,0) = 0 AND _minutes >= 60 AND _pos IN ('gk','def') THEN 4
            WHEN COALESCE(_conceded,0) = 0 AND _minutes >= 60 AND _pos = 'mid' THEN 1
            ELSE 0 END)
    + (CASE WHEN _pos = 'gk' THEN FLOOR(COALESCE(_saves,0) / 3.0)::int ELSE 0 END)
    + COALESCE(_pens_saved,0) * 5
    - COALESCE(_pens_missed,0) * 2
    - (CASE WHEN _pos IN ('gk','def') THEN FLOOR(COALESCE(_conceded,0) / 2.0)::int ELSE 0 END)
    - COALESCE(_yellows,0)
    - COALESCE(_reds,0) * 3
    - COALESCE(_own_goals,0) * 2
    + GREATEST(COALESCE(_shots_on_target,0) - COALESCE(_goals,0), 0) * 1
    + (CASE WHEN _pos = 'gk' THEN FLOOR(COALESCE(_shots_faced,0) / 5.0)::int ELSE 0 END)
    + FLOOR(COALESCE(_fouls_suffered,0) / 3.0)::int
    - FLOOR(COALESCE(_fouls_committed,0) / 3.0)::int
    - FLOOR(COALESCE(_offsides,0) / 2.0)::int
    + COALESCE(_bonus,0)
  END;
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
     SET points = fantasy_calc_points(p.position, s.minutes, s.goals, s.assists, s.saves,
                                      s.pens_saved, s.pens_missed, s.goals_conceded,
                                      s.yellows, s.reds, s.own_goals, s.bonus,
                                      s.shots_on_target, s.shots, s.shots_faced,
                                      s.fouls_committed, s.fouls_suffered, s.offsides,
                                      (COALESCE(s.minutes,0) >= 60))
    FROM fantasy_players p
   WHERE p.id = s.player_id AND s.fixture_id = v_fixture;

  FOR v_squad IN SELECT * FROM fantasy_squads WHERE gameweek_id = _gameweek_id LOOP
    v_total := 0;
    UPDATE fantasy_squad_picks SET points = NULL, auto_subbed = false WHERE squad_id = v_squad.id;

    FOR v_pick IN
      SELECT sp.id, sp.is_starter, sp.player_id,
             COALESCE(st.minutes,0) AS minutes,
             COALESCE(st.goals,0) AS goals,
             COALESCE(st.assists,0) AS assists,
             COALESCE(
               fantasy_calc_points(COALESCE(sp.picked_position, p.position),
                                   st.minutes, st.goals, st.assists, st.saves,
                                   st.pens_saved, st.pens_missed, st.goals_conceded,
                                   st.yellows, st.reds, st.own_goals, st.bonus,
                                   st.shots_on_target, st.shots, st.shots_faced,
                                   st.fouls_committed, st.fouls_suffered, st.offsides,
                                   sp.is_starter),
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