CREATE OR REPLACE FUNCTION public.vpn_credential_expiry(p_credential uuid)
RETURNS TABLE(owner_id uuid, expiry_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','private','pg_catalog'
AS $$
 SELECT c.owner_id,c.expiry_at FROM private.app_credentials c WHERE c.id=p_credential;
$$;
REVOKE ALL ON FUNCTION public.vpn_credential_expiry(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vpn_credential_expiry(uuid) TO service_role;
COMMENT ON FUNCTION public.vpn_credential_expiry(uuid) IS 'Server-only VPN pricing and entitlement metadata; never exposes decrypted credentials.';