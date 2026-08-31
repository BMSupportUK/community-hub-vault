CREATE OR REPLACE FUNCTION public.app_login_name_exists(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.app_credentials c
    WHERE lower(trim(c.app_login_name)) = lower(trim(_name))
  );
$$;

REVOKE ALL ON FUNCTION public.app_login_name_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_login_name_exists(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_login_name_exists(text) TO service_role;