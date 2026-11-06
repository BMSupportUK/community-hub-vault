CREATE TABLE public.player_connection_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  user_id uuid,
  platform text,
  app_version text,
  iptv_username text,
  watching_kind text,
  watching_title text,
  watching_category text,
  watching_player text,
  preview boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_ip text, geo_city text, geo_region text, geo_country text, geo_lat double precision, geo_lon double precision,
  vpn_status text, vpn_provider text
);
CREATE INDEX player_connection_log_started_idx ON public.player_connection_log (started_at DESC);
CREATE UNIQUE INDEX player_connection_log_session_idx ON public.player_connection_log (device_id, started_at);
GRANT SELECT ON public.player_connection_log TO authenticated;
GRANT ALL ON public.player_connection_log TO service_role;
ALTER TABLE public.player_connection_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read player connection log" ON public.player_connection_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_player_connection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.watching_since IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.player_connection_log (device_id, user_id, platform, app_version, iptv_username, watching_kind, watching_title, watching_category, watching_player, preview, started_at, last_seen_at, last_ip, geo_city, geo_region, geo_country, geo_lat, geo_lon, vpn_status, vpn_provider)
  VALUES (NEW.id, NEW.user_id, NEW.platform, NEW.app_version, NEW.iptv_username, NEW.watching_kind, NEW.watching_title, NEW.watching_category, NEW.watching_player, coalesce(NEW.watching_preview, false), NEW.watching_since, coalesce(NEW.last_seen_at, now()), NEW.last_ip, NEW.geo_city, NEW.geo_region, NEW.geo_country, NEW.geo_lat, NEW.geo_lon, NEW.vpn_status, NEW.vpn_provider)
  ON CONFLICT (device_id, started_at) DO UPDATE SET last_seen_at = greatest(player_connection_log.last_seen_at, EXCLUDED.last_seen_at),
    watching_title = EXCLUDED.watching_title, watching_category = EXCLUDED.watching_category, watching_player = EXCLUDED.watching_player,
    preview = EXCLUDED.preview, vpn_status = EXCLUDED.vpn_status, vpn_provider = EXCLUDED.vpn_provider;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_player_connection() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER player_devices_connection_log AFTER INSERT OR UPDATE OF watching_since, last_seen_at, watching_title ON public.player_devices FOR EACH ROW EXECUTE FUNCTION public.log_player_connection();

CREATE OR REPLACE FUNCTION public.purge_player_connection_log() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.player_connection_log WHERE started_at < now() - interval '30 days';
$$;
REVOKE EXECUTE ON FUNCTION public.purge_player_connection_log() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('purge-player-connection-log', '15 3 * * *', 'select public.purge_player_connection_log()');