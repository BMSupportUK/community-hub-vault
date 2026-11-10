CREATE OR REPLACE FUNCTION public.player_owner_saved_logins()
RETURNS TABLE(id uuid, app_login_name text, password text, expiry_at timestamptz, account_type text, account_number integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private,pg_catalog
AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 RETURN QUERY SELECT c.id,c.app_login_name,private.app_decrypt(c.password_enc),c.expiry_at,c.account_type,c.account_number
 FROM private.app_credentials c WHERE c.owner_id=auth.uid() ORDER BY c.account_number,c.created_at;
END; $$;
REVOKE ALL ON FUNCTION public.player_owner_saved_logins() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.player_owner_saved_logins() TO authenticated;
COMMENT ON FUNCTION public.player_owner_saved_logins() IS 'Link Device lists all saved logins belonging to the authenticated owner, independently of retired profile selection; accepts no caller-supplied owner.';