CREATE OR REPLACE FUNCTION public.log_player_connection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.watching_since IS NULL OR NEW.watching_preview IS TRUE THEN RETURN NEW; END IF;
  INSERT INTO public.player_connection_log (device_id, user_id, platform, app_version, iptv_username, watching_kind, watching_title, watching_category, watching_player, preview, started_at, last_seen_at, last_ip, geo_city, geo_region, geo_country, geo_lat, geo_lon, vpn_status, vpn_provider)
  VALUES (NEW.id, NEW.user_id, NEW.platform, NEW.app_version, NEW.iptv_username, NEW.watching_kind, NEW.watching_title, NEW.watching_category, NEW.watching_player, false, NEW.watching_since, coalesce(NEW.last_seen_at, now()), NEW.last_ip, NEW.geo_city, NEW.geo_region, NEW.geo_country, NEW.geo_lat, NEW.geo_lon, NEW.vpn_status, NEW.vpn_provider)
  ON CONFLICT (device_id, started_at) DO UPDATE SET last_seen_at = greatest(player_connection_log.last_seen_at, EXCLUDED.last_seen_at),
    watching_title = EXCLUDED.watching_title, watching_category = EXCLUDED.watching_category, watching_player = EXCLUDED.watching_player,
    preview = false, vpn_status = EXCLUDED.vpn_status, vpn_provider = EXCLUDED.vpn_provider;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_player_connection() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER player_devices_connection_log AFTER INSERT OR UPDATE OF watching_since, last_seen_at, watching_title, watching_preview ON public.player_devices FOR EACH ROW EXECUTE FUNCTION public.log_player_connection();