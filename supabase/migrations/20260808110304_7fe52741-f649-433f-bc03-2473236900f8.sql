ALTER TABLE public.fantasy_squad_picks ADD COLUMN IF NOT EXISTS auto_subbed boolean NOT NULL DEFAULT false;

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
  v_sub record;
  v_total int;
  v_cap_pts int;
  v_cap_played boolean;
  v_vice_played boolean;
  v_def int; v_mid int; v_fwd int;
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

    -- outfield shape of starters who actually played (used to keep the XI legal)
    SELECT
      COUNT(*) FILTER (WHERE p.position = 'def'),
      COUNT(*) FILTER (WHERE p.position = 'mid'),
      COUNT(*) FILTER (WHERE p.position = 'fwd')
      INTO v_def, v_mid, v_fwd
      FROM fantasy_squad_picks sp
      JOIN fantasy_players p ON p.id = sp.player_id
      LEFT JOIN fantasy_player_stats st ON st.player_id = sp.player_id AND st.fixture_id = v_fixture
     WHERE sp.squad_id = v_squad.id AND sp.is_starter AND COALESCE(st.minutes,0) > 0;

    FOR v_pick IN
      SELECT sp.id, sp.player_id, p.position,
             COALESCE(st.minutes,0) AS minutes, COALESCE(st.points,0) AS pts
        FROM fantasy_squad_picks sp
        JOIN fantasy_players p ON p.id = sp.player_id
        LEFT JOIN fantasy_player_stats st ON st.player_id = sp.player_id AND st.fixture_id = v_fixture
       WHERE sp.squad_id = v_squad.id AND sp.is_starter
       ORDER BY sp.slot_order
    LOOP
      IF v_pick.minutes > 0 THEN
        UPDATE fantasy_squad_picks SET points = v_pick.pts WHERE id = v_pick.id;
        v_total := v_total + v_pick.pts;
      ELSE
        UPDATE fantasy_squad_picks SET points = 0 WHERE id = v_pick.id;

        v_sub := NULL;
        SELECT sp.id, sp.player_id, p.position, COALESCE(st.points,0) AS pts
          INTO v_sub
          FROM fantasy_squad_picks sp
          JOIN fantasy_players p ON p.id = sp.player_id
          JOIN fantasy_player_stats st ON st.player_id = sp.player_id AND st.fixture_id = v_fixture
         WHERE sp.squad_id = v_squad.id AND NOT sp.is_starter
           AND st.minutes > 0 AND sp.points IS NULL
           AND (
             CASE WHEN v_pick.position = 'gk' THEN p.position = 'gk'
                  ELSE p.position <> 'gk'
                    -- keep a legal shape: at least 3 def, 3 mid, 1 fwd once subs are done
                    AND (v_def + (CASE WHEN p.position = 'def' THEN 1 ELSE 0 END)) >= 3
                    AND (v_mid + (CASE WHEN p.position = 'mid' THEN 1 ELSE 0 END)) >= 3
                    AND (v_fwd + (CASE WHEN p.position = 'fwd' THEN 1 ELSE 0 END)) >= 1
             END
           )
         ORDER BY
           -- prefer a like-for-like replacement, then bench order
           (CASE WHEN p.position = v_pick.position THEN 0 ELSE 1 END), sp.slot_order
         LIMIT 1;

        -- if no shape-preserving option exists, fall back to plain bench order
        IF v_sub.id IS NULL THEN
          SELECT sp.id, sp.player_id, p.position, COALESCE(st.points,0) AS pts
            INTO v_sub
            FROM fantasy_squad_picks sp
            JOIN fantasy_players p ON p.id = sp.player_id
            JOIN fantasy_player_stats st ON st.player_id = sp.player_id AND st.fixture_id = v_fixture
           WHERE sp.squad_id = v_squad.id AND NOT sp.is_starter
             AND st.minutes > 0 AND sp.points IS NULL
             AND ((v_pick.position = 'gk' AND p.position = 'gk') OR (v_pick.position <> 'gk' AND p.position <> 'gk'))
           ORDER BY sp.slot_order
           LIMIT 1;
        END IF;

        IF v_sub.id IS NOT NULL THEN
          UPDATE fantasy_squad_picks SET points = v_sub.pts, auto_subbed = true WHERE id = v_sub.id;
          v_total := v_total + v_sub.pts;
          IF v_sub.position = 'def' THEN v_def := v_def + 1;
          ELSIF v_sub.position = 'mid' THEN v_mid := v_mid + 1;
          ELSIF v_sub.position = 'fwd' THEN v_fwd := v_fwd + 1;
          END IF;
        END IF;
      END IF;
    END LOOP;

    -- bench players who did not come on score nothing
    UPDATE fantasy_squad_picks SET points = 0
     WHERE squad_id = v_squad.id AND NOT is_starter AND points IS NULL;

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