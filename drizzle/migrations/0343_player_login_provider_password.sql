CREATE OR REPLACE FUNCTION public.player_login_provider_password(p_login text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','private','pg_catalog'
AS $$
  SELECT private.app_decrypt(c.password_enc) FROM private.app_credentials c
  WHERE lower(btrim(c.app_login_name)) = lower(btrim(p_login)) AND c.password_enc IS NOT NULL
  ORDER BY c.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.player_login_provider_password(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_login_provider_password(text) TO service_role;