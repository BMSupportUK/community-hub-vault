CREATE OR REPLACE FUNCTION public.device_switch_profile_by_number(_device uuid, _number text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'private','public','extensions','pg_catalog' AS $$
DECLARE d record; c record;
BEGIN
  SELECT id, user_id INTO d FROM public.player_devices WHERE id = _device;
  IF d.user_id IS NULL THEN RETURN NULL; END IF;
  SELECT a.id, a.app_login_name, private.app_decrypt(a.password_enc) pw INTO c
    FROM private.app_credentials a
   WHERE a.owner_id = d.user_id AND a.player_number::text = _number AND a.app_login_name IS NOT NULL LIMIT 1;
  IF c.id IS NULL OR c.pw IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.player_pending_credentials(device_id, username, password, created_at)
    VALUES (d.id, c.app_login_name, c.pw, now())
    ON CONFLICT (device_id) DO UPDATE SET username = excluded.username, password = excluded.password, created_at = now();
  UPDATE public.player_devices SET credential_id = c.id, iptv_username = c.app_login_name, unlock_failures = 0, unlock_locked_until = NULL WHERE id = d.id;
  RETURN c.app_login_name;
END $$;
REVOKE ALL ON FUNCTION public.device_switch_profile_by_number(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.device_switch_profile_by_number(uuid, text) TO service_role;