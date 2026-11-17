CREATE OR REPLACE FUNCTION public.admin_vpn_subscriber_lookup(p_query text DEFAULT NULL, p_credential_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, owner_id uuid, app_login_name text, expiry_at timestamptz, subscriber_username text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE needle text := btrim(coalesce(p_query, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) OR public.customer_profile_restricted() THEN
    RAISE EXCEPTION 'Only admin and management can manage the VPN' USING ERRCODE = '42501';
  END IF;
  IF p_credential_id IS NULL AND (length(needle) < 2 OR length(needle) > 60) THEN
    RAISE EXCEPTION 'Enter between 2 and 60 characters';
  END IF;
  RETURN QUERY
  SELECT c.id, c.owner_id, c.app_login_name, c.expiry_at, p.username
  FROM private.app_credentials c
  LEFT JOIN public.profiles p ON p.id = c.owner_id
  WHERE c.owner_id IS NOT NULL
    AND ((p_credential_id IS NOT NULL AND c.id = p_credential_id)
      OR (p_credential_id IS NULL AND (strpos(lower(coalesce(c.app_login_name,'')), lower(needle)) > 0 OR strpos(lower(coalesce(p.username,'')), lower(needle)) > 0)))
  ORDER BY (lower(coalesce(c.app_login_name,'')) = lower(needle)) DESC, (lower(coalesce(p.username,'')) = lower(needle)) DESC, lower(coalesce(p.username,'')), lower(coalesce(c.app_login_name,'')), c.id
  LIMIT 15;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_vpn_subscriber_lookup(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_vpn_subscriber_lookup(text, uuid) TO authenticated;