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
  -- Revoke subscriber where every credential has expired
  FOR r IN
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'subscriber'::app_role
      AND NOT public.has_any_role(ur.user_id, ARRAY['admin','management','staff','moderator']::app_role[])
      AND EXISTS (SELECT 1 FROM private.app_credentials c WHERE c.owner_id = ur.user_id AND c.expiry_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM private.app_credentials c WHERE c.owner_id = ur.user_id AND (c.expiry_at IS NULL OR c.expiry_at >= now()))
  LOOP
    DELETE FROM public.user_roles WHERE user_id = r.user_id AND role = 'subscriber'::app_role;
    INSERT INTO public.user_roles (user_id, role) VALUES (r.user_id, 'nonsubscriber'::app_role) ON CONFLICT DO NOTHING;
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

REVOKE ALL ON FUNCTION public.sync_subscriber_roles_from_credentials() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.revoke_all_expired_subscriber_roles()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.sync_subscriber_roles_from_credentials();
$$;

REVOKE ALL ON FUNCTION public.revoke_all_expired_subscriber_roles() FROM anon, authenticated;

SELECT public.sync_subscriber_roles_from_credentials();