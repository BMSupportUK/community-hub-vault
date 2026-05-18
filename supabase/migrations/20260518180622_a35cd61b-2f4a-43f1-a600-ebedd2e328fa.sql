-- When a user's subscription expires, downgrade them to 'nonsubscriber'
-- instead of leaving them with no role (which would push them back to the /gate).

CREATE OR REPLACE FUNCTION public.revoke_expired_subscriber_role(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_has_sub boolean;
  v_protected boolean;
  v_max_expiry timestamptz;
  v_any_creds boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'subscriber'::app_role
  ) INTO v_has_sub;
  IF NOT v_has_sub THEN RETURN false; END IF;

  v_protected := public.has_any_role(
    _user_id,
    ARRAY['admin','management','staff','moderator']::app_role[]
  );
  IF v_protected THEN RETURN false; END IF;

  SELECT MAX(expiry_at), bool_or(expiry_at IS NOT NULL)
    INTO v_max_expiry, v_any_creds
  FROM private.app_credentials
  WHERE owner_id = _user_id;

  IF NOT v_any_creds THEN RETURN false; END IF;
  IF v_max_expiry IS NULL OR v_max_expiry >= now() THEN RETURN false; END IF;

  DELETE FROM public.user_roles
    WHERE user_id = _user_id AND role = 'subscriber'::app_role;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'nonsubscriber'::app_role)
    ON CONFLICT DO NOTHING;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_all_expired_subscriber_roles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_count integer := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'subscriber'::app_role
      AND NOT public.has_any_role(
        ur.user_id,
        ARRAY['admin','management','staff','moderator']::app_role[]
      )
      AND EXISTS (
        SELECT 1 FROM private.app_credentials c
        WHERE c.owner_id = ur.user_id AND c.expiry_at IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM private.app_credentials c
        WHERE c.owner_id = ur.user_id
          AND (c.expiry_at IS NULL OR c.expiry_at >= now())
      )
  LOOP
    DELETE FROM public.user_roles
      WHERE user_id = r.user_id AND role = 'subscriber'::app_role;
    INSERT INTO public.user_roles (user_id, role)
      VALUES (r.user_id, 'nonsubscriber'::app_role)
      ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.revoke_expired_subscriber_role(uuid) TO authenticated;