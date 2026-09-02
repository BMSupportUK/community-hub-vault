CREATE OR REPLACE FUNCTION public.revoke_expired_subscriber_role(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_protected boolean;
  v_any_creds boolean;
  v_has_live boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  v_protected := public.has_any_role(
    _user_id,
    ARRAY['admin','management','staff','moderator']::app_role[]
  );
  IF v_protected THEN RETURN false; END IF;

  SELECT bool_or(expiry_at IS NOT NULL),
         bool_or(expiry_at IS NULL OR expiry_at >= now())
    INTO v_any_creds, v_has_live
  FROM private.app_credentials
  WHERE owner_id = _user_id;

  IF NOT COALESCE(v_any_creds, false) THEN RETURN false; END IF;
  IF COALESCE(v_has_live, false) THEN RETURN false; END IF;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'nonsubscriber'::app_role)
    ON CONFLICT DO NOTHING;

  DELETE FROM public.user_roles
   WHERE user_id = _user_id
     AND role = ANY (ARRAY['subscriber','member','guest']::app_role[]);

  RETURN true;
END;
$$;

SELECT public.sync_subscriber_roles_from_credentials();