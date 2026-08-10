CREATE OR REPLACE FUNCTION public.fantasy_score_gameweek(_gameweek_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
                                      s.yellows, s.reds, s.own_goals, s.bonus)
    FROM fantasy_players p
   WHERE p.id = s.player_id AND s.fixture_id = v_fixture;

  FOR v_squad IN SELECT * FROM fantasy_squads WHERE gameweek_id = _gameweek_id LOOP
    v_total := 0;
    UPDATE fantasy_squad_picks SET points = NULL, auto_subbed = false WHERE squad_id = v_squad.id;

    -- Everyone who took part scores. Subs earn extra sub points on top.
    FOR v_pick IN
      SELECT sp.id, sp.is_starter,
             COALESCE(st.minutes,0) AS minutes,
             COALESCE(st.points,0) AS pts,
             COALESCE(st.goals,0) AS goals,
             COALESCE(st.assists,0) AS assists
        FROM fantasy_squad_picks sp
        JOIN fantasy_players p ON p.id = sp.player_id
        LEFT JOIN fantasy_player_stats st ON st.player_id = sp.player_id AND st.fixture_id = v_fixture
       WHERE sp.squad_id = v_squad.id
       ORDER BY sp.is_starter DESC, sp.slot_order
    LOOP
      IF v_pick.minutes > 0 THEN
        v_pts := v_pick.pts;
        IF NOT v_pick.is_starter THEN
          -- sub points: came on (+1), 30+ minutes off the bench (+1), goal or assist off the bench (+1)
          v_pts := v_pts + 1
                 + (CASE WHEN v_pick.minutes >= 30 THEN 1 ELSE 0 END)
                 + (CASE WHEN (v_pick.goals + v_pick.assists) > 0 THEN 1 ELSE 0 END);
        END IF;
        UPDATE fantasy_squad_picks
           SET points = v_pts, auto_subbed = (NOT v_pick.is_starter)
         WHERE id = v_pick.id;
        v_total := v_total + v_pts;
      ELSE
        UPDATE fantasy_squad_picks SET points = 0 WHERE id = v_pick.id;
      END IF;
    END LOOP;

    -- Captain (or vice, if the captain did not play) scores double.
    v_cap_pts := NULL;
    SELECT COALESCE(st.minutes,0) > 0 INTO v_cap_played
      FROM fantasy_player_stats st WHERE st.fixture_id = v_fixture AND st.player_id = v_squad.captain_id;
    v_cap_played := COALESCE(v_cap_played, false);
    IF v_cap_played THEN
      SELECT points INTO v_cap_pts FROM fantasy_squad_picks WHERE squad_id = v_squad.id AND player_id = v_squad.captain_id;
    ELSE
      SELECT COALESCE(st.minutes,0) > 0 INTO v_vice_played
        FROM fantasy_player_stats st WHERE st.fixture_id = v_fixture AND st.player_id = v_squad.vice_id;
      IF COALESCE(v_vice_played,false) THEN
        SELECT points INTO v_cap_pts FROM fantasy_squad_picks WHERE squad_id = v_squad.id AND player_id = v_squad.vice_id;
      END IF;
    END IF;
    v_total := v_total + COALESCE(v_cap_pts, 0);

    UPDATE fantasy_squads SET points = v_total - COALESCE(transfer_cost,0) WHERE id = v_squad.id;
  END LOOP;
END;
$$;