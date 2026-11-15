CREATE TABLE public.player_connection_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  user_id uuid,
  title text NOT NULL,
  kind text,
  login text,
  started_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ping_last integer,
  ping_min integer,
  ping_max integer,
  speed_last_kbps integer,
  samples integer NOT NULL DEFAULT 0,
  UNIQUE (device_id, started_at, title)
);
CREATE INDEX player_connection_sessions_user_idx ON public.player_connection_sessions (user_id, started_at DESC);
GRANT SELECT ON public.player_connection_sessions TO authenticated;
GRANT ALL ON public.player_connection_sessions TO service_role;
ALTER TABLE public.player_connection_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY connection_sessions_admin ON public.player_connection_sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.record_player_connection_session(_device uuid, _user uuid, _title text, _kind text, _login text, _started timestamptz, _ping integer, _speed integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.player_connection_sessions (device_id, user_id, title, kind, login, started_at, last_seen_at, ping_last, ping_min, ping_max, speed_last_kbps, samples)
  VALUES (_device, _user, _title, _kind, _login, _started, now(), _ping, _ping, _ping, NULLIF(_speed, 0), 1)
  ON CONFLICT (device_id, started_at, title) DO UPDATE SET
    last_seen_at = now(),
    ping_last = COALESCE(EXCLUDED.ping_last, player_connection_sessions.ping_last),
    ping_min = LEAST(player_connection_sessions.ping_min, EXCLUDED.ping_min),
    ping_max = GREATEST(player_connection_sessions.ping_max, EXCLUDED.ping_max),
    speed_last_kbps = COALESCE(EXCLUDED.speed_last_kbps, player_connection_sessions.speed_last_kbps),
    samples = player_connection_sessions.samples + 1;
$$;
REVOKE ALL ON FUNCTION public.record_player_connection_session(uuid, uuid, text, text, text, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_player_connection_session(uuid, uuid, text, text, text, timestamptz, integer, integer) TO service_role;