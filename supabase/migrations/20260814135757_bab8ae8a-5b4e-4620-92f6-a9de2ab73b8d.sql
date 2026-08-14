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
  v_subs_used int;
BEGIN
  SELECT fixture_id INTO v_fixture FROM fantasy_gameweeks WHERE id = _gameweek_id;
  IF v_fixture IS NULL THEN RETURN; END IF;

  UPDATE fantasy_player_stats s
     SET points = fantasy_points_for(p.position, (COALESCE(s.minutes,0) >= 60), s.*)
    FROM fantasy_players p
   WHERE p.id = s.player_id AND s.fixture_id = v_fixture;

  FOR v_squad IN SELECT * FROM fantasy_squads WHERE gameweek_id = _gameweek_id LOOP
    v_total := 0;
    v_subs_used := 0;
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
       -- starters first, then subs ordered by who came on earliest (most minutes played)
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