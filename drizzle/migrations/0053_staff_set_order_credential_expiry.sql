CREATE OR REPLACE FUNCTION public.staff_set_order_credential_expiry(p_order_id uuid, p_credential_id uuid, p_expiry timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','private','pg_catalog'
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_expiry IS NULL OR p_expiry <= now() THEN
    RAISE EXCEPTION 'Expiry must be in the future';
  END IF;
  IF p_credential_id IS NOT NULL THEN
    UPDATE private.app_credentials SET expiry_at = p_expiry, updated_at = now() WHERE id = p_credential_id;
  ELSE
    UPDATE private.pending_order_credentials SET expiry_at = p_expiry WHERE order_id = p_order_id;
  END IF;
  RETURN p_expiry;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_set_order_credential_expiry(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_order_credential_expiry(uuid, uuid, timestamptz) TO authenticated;