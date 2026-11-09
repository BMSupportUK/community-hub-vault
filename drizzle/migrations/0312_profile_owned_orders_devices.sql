ALTER TABLE private.orders ADD COLUMN IF NOT EXISTS credential_id uuid;
ALTER TABLE public.player_devices ADD COLUMN IF NOT EXISTS credential_id uuid;

CREATE OR REPLACE FUNCTION public.owner_login_credential(_owner uuid, _login text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,private AS $$
  SELECT COALESCE(
    (SELECT a.id FROM private.app_credentials a WHERE a.owner_id=_owner AND _login IS NOT NULL AND lower(btrim(a.app_login_name))=lower(btrim(_login)) LIMIT 1),
    (SELECT a.id FROM private.app_credentials a WHERE a.owner_id=_owner ORDER BY a.account_number NULLS LAST, a.created_at LIMIT 1))
$$;
REVOKE EXECUTE ON FUNCTION public.owner_login_credential(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.active_profile_credential() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,private AS $$
  SELECT COALESCE(
    (SELECT s.credential_id FROM public.profile_session_access s WHERE s.session_id=public.profile_auth_session_id() AND s.user_id=auth.uid()),
    (SELECT a.id FROM private.app_credentials a WHERE a.owner_id=auth.uid() ORDER BY a.account_number NULLS LAST, a.created_at LIMIT 1))
$$;
GRANT EXECUTE ON FUNCTION public.active_profile_credential() TO authenticated;

ALTER TABLE private.orders DISABLE TRIGGER USER;
UPDATE private.orders o SET credential_id=public.owner_login_credential(o.user_id, o.existing_username) WHERE o.credential_id IS NULL AND o.user_id IS NOT NULL;
ALTER TABLE private.orders ENABLE TRIGGER USER;
ALTER TABLE public.player_devices DISABLE TRIGGER USER;
UPDATE public.player_devices d SET credential_id=public.owner_login_credential(d.user_id, d.iptv_username) WHERE d.credential_id IS NULL AND d.user_id IS NOT NULL;
ALTER TABLE public.player_devices ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION private.set_order_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
  IF NEW.credential_id IS NULL AND NEW.user_id IS NOT NULL THEN
    IF NEW.user_id = auth.uid() THEN NEW.credential_id := public.active_profile_credential(); END IF;
    IF NEW.credential_id IS NULL THEN NEW.credential_id := public.owner_login_credential(NEW.user_id, NEW.existing_username); END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS set_order_profile ON private.orders;
CREATE TRIGGER set_order_profile BEFORE INSERT ON private.orders FOR EACH ROW EXECUTE FUNCTION private.set_order_profile();

CREATE OR REPLACE FUNCTION public.set_device_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
  IF NEW.user_id IS NULL THEN NEW.credential_id := NULL; RETURN NEW; END IF;
  IF TG_OP='INSERT' OR NEW.credential_id IS NULL OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.iptv_username IS DISTINCT FROM OLD.iptv_username THEN
    NEW.credential_id := public.owner_login_credential(NEW.user_id, NEW.iptv_username);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_device_profile() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS set_device_profile ON public.player_devices;
CREATE TRIGGER set_device_profile BEFORE INSERT OR UPDATE ON public.player_devices FOR EACH ROW EXECUTE FUNCTION public.set_device_profile();

DROP POLICY IF EXISTS "orders own profile only" ON private.orders;
CREATE POLICY "orders own profile only" ON private.orders AS RESTRICTIVE FOR SELECT TO authenticated
  USING (user_id IS DISTINCT FROM auth.uid() OR credential_id IS NULL OR credential_id = public.active_profile_credential());
DROP POLICY IF EXISTS "devices own profile only" ON public.player_devices;
CREATE POLICY "devices own profile only" ON public.player_devices AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id IS DISTINCT FROM auth.uid() OR credential_id IS NULL OR credential_id = public.active_profile_credential());