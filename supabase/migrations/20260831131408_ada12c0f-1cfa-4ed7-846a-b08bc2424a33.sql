REVOKE ALL ON FUNCTION public.sync_boro_fan_zone_member_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_boro_fan_zone_member_role() FROM anon;
REVOKE ALL ON FUNCTION public.sync_boro_fan_zone_member_role() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_boro_fan_zone_member_role() TO service_role;