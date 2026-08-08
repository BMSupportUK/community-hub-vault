-- ============ PLAYERS ============
CREATE TABLE public.fantasy_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  position text NOT NULL CHECK (position IN ('gk','def','mid','fwd')),
  shirt_number integer,
  value_m numeric(4,1) NOT NULL DEFAULT 4.0 CHECK (value_m >= 0 AND value_m <= 20),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','injured','suspended','departed')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fantasy_players TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_players TO authenticated;
GRANT ALL ON public.fantasy_players TO service_role;
ALTER TABLE public.fantasy_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_players_select_all" ON public.fantasy_players FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "fantasy_players_admin_write" ON public.fantasy_players FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE TRIGGER fantasy_players_touch BEFORE UPDATE ON public.fantasy_players
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ GAMEWEEKS ============
CREATE TABLE public.fantasy_gameweeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gw_number integer NOT NULL UNIQUE,
  fixture_id uuid NOT NULL UNIQUE REFERENCES public.boro_fixtures(id) ON DELETE CASCADE,
  lock_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','locked','final')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fantasy_gameweeks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_gameweeks TO authenticated;
GRANT ALL ON public.fantasy_gameweeks TO service_role;
ALTER TABLE public.fantasy_gameweeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_gameweeks_select_all" ON public.fantasy_gameweeks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "fantasy_gameweeks_admin_write" ON public.fantasy_gameweeks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE TRIGGER fantasy_gameweeks_touch BEFORE UPDATE ON public.fantasy_gameweeks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ENTRANTS ============
CREATE TABLE public.fantasy_entrants (
  user_id uuid PRIMARY KEY,
  team_name text NOT NULL DEFAULT 'My Boro XI',
  free_transfers integer NOT NULL DEFAULT 1,
  wildcard_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.fantasy_entrants TO authenticated;
GRANT ALL ON public.fantasy_entrants TO service_role;
ALTER TABLE public.fantasy_entrants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_entrants_select_auth" ON public.fantasy_entrants FOR SELECT TO authenticated USING (true);
CREATE POLICY "fantasy_entrants_insert_own" ON public.fantasy_entrants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "fantasy_entrants_update_own" ON public.fantasy_entrants FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE TRIGGER fantasy_entrants_touch BEFORE UPDATE ON public.fantasy_entrants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fantasy_guest_entrants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name text NOT NULL,
  team_name text NOT NULL DEFAULT 'My Boro XI',
  pin_salt text NOT NULL,
  pin_hash text NOT NULL,
  pin_reset_hash text,
  pin_reset_expires_at timestamptz,
  free_transfers integer NOT NULL DEFAULT 1,
  wildcard_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fantasy_guest_entrants TO service_role;
ALTER TABLE public.fantasy_guest_entrants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_guest_entrants_no_direct_select" ON public.fantasy_guest_entrants FOR SELECT TO authenticated USING (false);
CREATE TRIGGER fantasy_guest_entrants_touch BEFORE UPDATE ON public.fantasy_guest_entrants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SQUADS ============
CREATE TABLE public.fantasy_squads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gameweek_id uuid NOT NULL REFERENCES public.fantasy_gameweeks(id) ON DELETE CASCADE,
  user_id uuid,
  guest_id uuid REFERENCES public.fantasy_guest_entrants(id) ON DELETE CASCADE,
  formation text NOT NULL DEFAULT '4-4-2',
  captain_id uuid REFERENCES public.fantasy_players(id) ON DELETE SET NULL,
  vice_id uuid REFERENCES public.fantasy_players(id) ON DELETE SET NULL,
  transfer_cost integer NOT NULL DEFAULT 0,
  points integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_squads_owner_chk CHECK ((user_id IS NOT NULL) <> (guest_id IS NOT NULL))
);
CREATE UNIQUE INDEX fantasy_squads_user_gw_uq ON public.fantasy_squads (gameweek_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX fantasy_squads_guest_gw_uq ON public.fantasy_squads (gameweek_id, guest_id) WHERE guest_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_squads TO authenticated;
GRANT ALL ON public.fantasy_squads TO service_role;
ALTER TABLE public.fantasy_squads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_squads_select" ON public.fantasy_squads FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')
  OR EXISTS (SELECT 1 FROM public.fantasy_gameweeks g WHERE g.id = gameweek_id AND g.lock_at <= now())
);
CREATE POLICY "fantasy_squads_insert_own" ON public.fantasy_squads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "fantasy_squads_update_own" ON public.fantasy_squads FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "fantasy_squads_delete_own" ON public.fantasy_squads FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER fantasy_squads_touch BEFORE UPDATE ON public.fantasy_squads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fantasy_squad_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.fantasy_squads(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.fantasy_players(id) ON DELETE CASCADE,
  is_starter boolean NOT NULL DEFAULT false,
  slot_order integer NOT NULL DEFAULT 0,
  buy_value_m numeric(4,1) NOT NULL DEFAULT 4.0,
  points integer,
  UNIQUE (squad_id, player_id)
);
CREATE INDEX fantasy_squad_picks_squad_idx ON public.fantasy_squad_picks (squad_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_squad_picks TO authenticated;
GRANT ALL ON public.fantasy_squad_picks TO service_role;
ALTER TABLE public.fantasy_squad_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_squad_picks_select" ON public.fantasy_squad_picks FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.fantasy_squads s
    JOIN public.fantasy_gameweeks g ON g.id = s.gameweek_id
    WHERE s.id = squad_id AND (
      s.user_id = auth.uid() OR g.lock_at <= now()
      OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')
    )
  )
);
CREATE POLICY "fantasy_squad_picks_write_own" ON public.fantasy_squad_picks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fantasy_squads s WHERE s.id = squad_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fantasy_squads s WHERE s.id = squad_id AND s.user_id = auth.uid()));

-- ============ PLAYER STATS ============
CREATE TABLE public.fantasy_player_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL REFERENCES public.boro_fixtures(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.fantasy_players(id) ON DELETE CASCADE,
  minutes integer NOT NULL DEFAULT 0 CHECK (minutes >= 0 AND minutes <= 130),
  goals integer NOT NULL DEFAULT 0,
  assists integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  pens_saved integer NOT NULL DEFAULT 0,
  pens_missed integer NOT NULL DEFAULT 0,
  goals_conceded integer NOT NULL DEFAULT 0,
  yellows integer NOT NULL DEFAULT 0,
  reds integer NOT NULL DEFAULT 0,
  own_goals integer NOT NULL DEFAULT 0,
  bonus integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixture_id, player_id)
);
GRANT SELECT ON public.fantasy_player_stats TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_player_stats TO authenticated;
GRANT ALL ON public.fantasy_player_stats TO service_role;
ALTER TABLE public.fantasy_player_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_player_stats_select_all" ON public.fantasy_player_stats FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "fantasy_player_stats_admin_write" ON public.fantasy_player_stats FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE TRIGGER fantasy_player_stats_touch BEFORE UPDATE ON public.fantasy_player_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TRANSFERS ============
CREATE TABLE public.fantasy_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gameweek_id uuid NOT NULL REFERENCES public.fantasy_gameweeks(id) ON DELETE CASCADE,
  user_id uuid,
  guest_id uuid REFERENCES public.fantasy_guest_entrants(id) ON DELETE CASCADE,
  out_player_id uuid REFERENCES public.fantasy_players(id) ON DELETE SET NULL,
  in_player_id uuid REFERENCES public.fantasy_players(id) ON DELETE SET NULL,
  cost integer NOT NULL DEFAULT 0,
  forced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.fantasy_transfers TO authenticated;
GRANT ALL ON public.fantasy_transfers TO service_role;
ALTER TABLE public.fantasy_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_transfers_select_own" ON public.fantasy_transfers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE POLICY "fantasy_transfers_insert_own" ON public.fantasy_transfers FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TABLE public.fantasy_club_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  other_club text,
  fee text,
  window_label text,
  transfer_date date NOT NULL DEFAULT current_date,
  player_id uuid REFERENCES public.fantasy_players(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fantasy_club_transfers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_club_transfers TO authenticated;
GRANT ALL ON public.fantasy_club_transfers TO service_role;
ALTER TABLE public.fantasy_club_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_club_transfers_select_all" ON public.fantasy_club_transfers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "fantasy_club_transfers_admin_write" ON public.fantasy_club_transfers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE TRIGGER fantasy_club_transfers_touch BEFORE UPDATE ON public.fantasy_club_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SCORING ============
CREATE OR REPLACE FUNCTION public.fantasy_calc_points(
  _pos text, _minutes int, _goals int, _assists int, _saves int,
  _pens_saved int, _pens_missed int, _conceded int, _yellows int,
  _reds int, _own_goals int, _bonus int
) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN COALESCE(_minutes,0) <= 0 THEN 0 ELSE
      (CASE WHEN _minutes >= 60 THEN 2 ELSE 1 END)
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
    + COALESCE(_bonus,0)
  END;
$$;

CREATE OR REPLACE FUNCTION public.fantasy_score_gameweek(_gameweek_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fixture uuid;
  v_squad record;
  v_pick record;
  v_total int;
  v_played int;
  v_needed int;
  v_sub record;
  v_cap_pts int;
  v_cap_played boolean;
  v_vice_played boolean;
BEGIN
  SELECT fixture_id INTO v_fixture FROM fantasy_gameweeks WHERE id = _gameweek_id;
  IF v_fixture IS NULL THEN RETURN; END IF;

  -- 1. player points for this fixture
  UPDATE fantasy_player_stats s
     SET points = fantasy_calc_points(p.position, s.minutes, s.goals, s.assists, s.saves,
                                      s.pens_saved, s.pens_missed, s.goals_conceded,
                                      s.yellows, s.reds, s.own_goals, s.bonus)
    FROM fantasy_players p
   WHERE p.id = s.player_id AND s.fixture_id = v_fixture;

  -- 2. per squad totals with auto-subs + captaincy
  FOR v_squad IN SELECT * FROM fantasy_squads WHERE gameweek_id = _gameweek_id LOOP
    v_total := 0;
    v_needed := 0;

    -- reset pick points
    UPDATE fantasy_squad_picks SET points = NULL WHERE squad_id = v_squad.id;

    -- starters
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
        -- auto-sub: first unused bench player who played (GK only replaced by GK)
        SELECT sp.id, sp.player_id, COALESCE(st.points,0) AS pts
          INTO v_sub
          FROM fantasy_squad_picks sp
          JOIN fantasy_players p ON p.id = sp.player_id
          JOIN fantasy_player_stats st ON st.player_id = sp.player_id AND st.fixture_id = v_fixture
         WHERE sp.squad_id = v_squad.id AND NOT sp.is_starter
           AND st.minutes > 0 AND sp.points IS NULL
           AND ((v_pick.position = 'gk' AND p.position = 'gk') OR (v_pick.position <> 'gk' AND p.position <> 'gk'))
         ORDER BY sp.slot_order
         LIMIT 1;
        IF v_sub.id IS NOT NULL THEN
          UPDATE fantasy_squad_picks SET points = v_sub.pts WHERE id = v_sub.id;
          v_total := v_total + v_sub.pts;
        END IF;
        UPDATE fantasy_squad_picks SET points = 0 WHERE id = v_pick.id;
      END IF;
      v_sub := NULL;
    END LOOP;

    -- captain doubling (vice takes over when captain did not play)
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
REVOKE ALL ON FUNCTION public.fantasy_score_gameweek(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fantasy_score_gameweek(uuid) TO service_role;

-- ============ LEADERBOARD VIEW ============
CREATE OR REPLACE VIEW public.fantasy_leaderboard
WITH (security_invoker = false) AS
SELECT
  COALESCE(s.user_id, s.guest_id) AS entrant_id,
  (s.guest_id IS NOT NULL) AS is_guest,
  COALESCE(ge.team_name, fe.team_name, 'My Boro XI') AS team_name,
  COALESCE(ge.display_name, pr.display_name, pr.username) AS display_name,
  pr.username,
  pr.avatar_url,
  SUM(COALESCE(s.points,0))::int AS total_points,
  SUM(COALESCE(s.transfer_cost,0))::int AS total_hits,
  COUNT(*) FILTER (WHERE s.points IS NOT NULL)::int AS gameweeks_scored,
  COUNT(*)::int AS squads_entered
FROM public.fantasy_squads s
LEFT JOIN public.fantasy_guest_entrants ge ON ge.id = s.guest_id
LEFT JOIN public.fantasy_entrants fe ON fe.user_id = s.user_id
LEFT JOIN public.profiles pr ON pr.id = s.user_id
GROUP BY COALESCE(s.user_id, s.guest_id), (s.guest_id IS NOT NULL), ge.team_name, fe.team_name, ge.display_name, pr.display_name, pr.username, pr.avatar_url;
GRANT SELECT ON public.fantasy_leaderboard TO service_role;

-- ============ SEED PLAYER POOL (2026/27 squad, admin editable) ============
INSERT INTO public.fantasy_players (name, position, shirt_number, value_m, sort_order) VALUES
  ('Seny Dieng','gk',1,5.0,1),
  ('Tom Glover','gk',13,4.5,2),
  ('Sol Brynn','gk',31,4.0,3),
  ('Dael Fry','def',6,5.0,10),
  ('Rav van den Berg','def',4,5.5,11),
  ('Alfie Jones','def',5,4.5,12),
  ('George Edmundson','def',15,4.5,13),
  ('Neto Borges','def',3,4.5,14),
  ('Tommy Conway','fwd',9,7.5,40),
  ('Ben Doak','mid',7,7.0,20),
  ('Hayden Hackney','mid',8,7.0,21),
  ('Aidan Morris','mid',22,6.0,22),
  ('Riley McGree','mid',10,5.5,23),
  ('Finn Azaz','mid',11,6.5,24),
  ('Sammy Silvera','mid',17,4.5,25),
  ('Delano Burgzorg','mid',19,6.0,26),
  ('Kaly Sene','fwd',24,5.5,41),
  ('Emmanuel Latte Lath','fwd',18,7.5,42),
  ('Marcus Forss','fwd',14,5.0,43),
  ('Luke Ayling','def',2,4.0,15),
  ('Darragh Lenihan','def',26,4.0,16),
  ('Anfernee Dijksteel','def',34,4.0,17),
  ('Law McCabe','mid',37,3.5,27),
  ('Tom Rogic','mid',20,4.0,28),
  ('Josh Coburn','fwd',30,4.5,44);