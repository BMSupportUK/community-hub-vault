-- Expired-subscription handling: leave only the nonsubscriber ("Expired Subscription")
-- membership role, protect privileged roles, and never touch users with a live account.

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
  -- Multiple accounts: one live account keeps the subscriber role intact.
  IF COALESCE(v_has_live, false) THEN RETURN false; END IF;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'nonsubscriber'::app_role)
    ON CONFLICT DO NOTHING;

  -- Strip every other membership role, keeping account-state roles
  -- (pending/rejected/banned) and Boro Fan Zone roles untouched.
  DELETE FROM public.user_roles
   WHERE user_id = _user_id
     AND role IN ('subscriber','member','guest')::app_role[]::app_role[];

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_subscriber_roles_from_credentials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r RECORD;
BEGIN
  -- Expired: every credential has lapsed → only the Expired Subscription role remains
  FOR r IN
    SELECT DISTINCT c.owner_id AS user_id
    FROM private.app_credentials c
    WHERE c.owner_id IS NOT NULL
      AND NOT public.has_any_role(c.owner_id, ARRAY['admin','management','staff','moderator']::app_role[])
      AND EXISTS (SELECT 1 FROM private.app_credentials c2 WHERE c2.owner_id = c.owner_id AND c2.expiry_at IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM private.app_credentials c2
        WHERE c2.owner_id = c.owner_id AND (c2.expiry_at IS NULL OR c2.expiry_at >= now())
      )
  LOOP
    INSERT INTO public.user_roles (user_id, role)
      VALUES (r.user_id, 'nonsubscriber'::app_role) ON CONFLICT DO NOTHING;
    DELETE FROM public.user_roles
      WHERE user_id = r.user_id
        AND role = ANY (ARRAY['subscriber','member','guest']::app_role[]);
    v_count := v_count + 1;
  END LOOP;

  -- Restore subscriber where at least one credential is still live
  FOR r IN
    SELECT DISTINCT c.owner_id AS user_id
    FROM private.app_credentials c
    WHERE c.owner_id IS NOT NULL
      AND (c.expiry_at IS NULL OR c.expiry_at >= now())
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = c.owner_id AND ur.role = 'subscriber'::app_role
      )
  LOOP
    INSERT INTO public.user_roles (user_id, role) VALUES (r.user_id, 'subscriber'::app_role) ON CONFLICT DO NOTHING;
    DELETE FROM public.user_roles WHERE user_id = r.user_id AND role = 'nonsubscriber'::app_role;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;