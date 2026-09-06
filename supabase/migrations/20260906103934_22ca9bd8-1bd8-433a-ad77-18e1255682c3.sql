ALTER TABLE public.fan_zone_mutes REPLICA IDENTITY FULL;
ALTER TABLE public.fan_zone_bans REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fan_zone_mutes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fan_zone_bans;