REVOKE ALL ON FUNCTION public.user_qualifies_for_customer_nameplate(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_customer_nameplate(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_customer_nameplate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_customer_nameplate_from_gate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_qualifies_for_customer_nameplate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_customer_nameplate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_customer_nameplate() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_customer_nameplate_from_gate() TO service_role;