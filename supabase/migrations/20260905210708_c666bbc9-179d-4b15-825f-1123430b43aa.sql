REVOKE EXECUTE ON FUNCTION public.fan_zone_mute(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fan_zone_unmute(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fan_zone_active_mute(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.forum_reported_posts(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.block_muted_fan_zone_write() FROM anon, authenticated;