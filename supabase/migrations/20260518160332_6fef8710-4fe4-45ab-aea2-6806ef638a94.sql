
-- Revoke subscriber role from a single user if all their app credentials are expired
-- Protects admin/management/staff/moderator roles (those users keep subscriber regardless).
CREATE OR REPLACE FUNCTION public.revoke_expired_subscriber_role(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
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

  -- Never touch privileged users
  v_protected := public.has_any_role(
    _user_id,
    ARRAY['admin','management','staff','moderator']::app_role[]
  );
  IF v_protected THEN RETURN false; END IF;

  SELECT MAX(expiry_at), bool_or(expiry_at IS NOT NULL)
    INTO v_max_expiry, v_any_creds
  FROM private.app_credentials
  WHERE owner_id = _user_id;

  -- Only revoke if user has at least one credential with an expiry and the
  -- latest expiry has passed. Users with no expiry data are left alone.
  IF v_any_creds IS TRUE AND v_max_expiry IS NOT NULL AND v_max_expiry < now() THEN
    DELETE FROM public.user_roles
      WHERE user_id = _user_id AND role = 'subscriber'::app_role;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_expired_subscriber_role(uuid) TO authenticated;

-- Sweep all users whose subscriptions have expired.
CREATE OR REPLACE FUNCTION public.revoke_all_expired_subscriber_roles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
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
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Schedule sweep every minute
DO $$
BEGIN
  PERFORM cron.unschedule('revoke-expired-subscribers');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'revoke-expired-subscribers',
  '* * * * *',
  $$SELECT public.revoke_all_expired_subscriber_roles();$$
);
