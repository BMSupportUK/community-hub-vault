ALTER TABLE public.fan_zone_appeal_messages REPLICA IDENTITY FULL;
ALTER TABLE public.fan_zone_appeals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fan_zone_appeal_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fan_zone_appeals;