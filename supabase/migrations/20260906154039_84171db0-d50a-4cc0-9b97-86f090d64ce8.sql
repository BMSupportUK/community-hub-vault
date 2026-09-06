REVOKE EXECUTE ON FUNCTION public.set_my_fan_profile(text, text, text, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_my_fan_profile(text, text, text, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_fan_profile(text, text, text, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_fan_profile(text, text, text, integer, text, text) TO service_role;