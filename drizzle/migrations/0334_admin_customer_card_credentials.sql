CREATE OR REPLACE FUNCTION public.admin_customer_card_credentials(p_owner uuid)
RETURNS TABLE(id uuid, owner_id uuid, app_login_name text, expiry_at timestamptz, password text, notes text, created_at timestamptz, updated_at timestamptz, created_by uuid, account_type text, account_number integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN
  RAISE EXCEPTION 'Forbidden';
 END IF;
 RETURN QUERY SELECT c.id,c.owner_id,c.app_login_name,c.expiry_at,private.app_decrypt(c.password_enc),private.app_decrypt(c.notes_enc),c.created_at,c.updated_at,c.created_by,c.account_type,c.account_number
 FROM private.app_credentials c WHERE c.owner_id=p_owner ORDER BY c.account_number,c.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_customer_card_credentials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_card_credentials(uuid) TO authenticated;
COMMENT ON FUNCTION public.admin_customer_card_credentials(uuid) IS 'Admin/management customer-card read of all owner credentials, independent of retired profile selection; ordinary credential visibility is unchanged.';