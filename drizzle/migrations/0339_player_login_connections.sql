CREATE OR REPLACE FUNCTION public.player_login_connections(p_login text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT CASE max(CASE account_type WHEN 'triple' THEN 3 WHEN 'multi' THEN 2 WHEN 'single' THEN 1 END)
    WHEN 3 THEN 3 WHEN 2 THEN 2 WHEN 1 THEN 1 ELSE NULL END
  FROM private.app_credentials WHERE lower(btrim(app_login_name)) = lower(btrim(p_login));
$$;
REVOKE ALL ON FUNCTION public.player_login_connections(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_login_connections(text) TO service_role;