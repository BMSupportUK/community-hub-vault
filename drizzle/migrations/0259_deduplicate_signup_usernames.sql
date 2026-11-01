CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_app_id uuid;
  v_blacklisted boolean;
  v_access_intent text := COALESCE(new.raw_user_meta_data->>'access_intent', 'bm-support');
  v_username_base text := COALESCE(NULLIF(new.raw_user_meta_data->>'username', ''), NULLIF(split_part(new.email, '@', 1), ''), 'member');
  v_username text := v_username_base;
  v_suffix bigint := 1;
  v_profile_id uuid;
BEGIN
  LOOP
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (
      new.id,
      v_username,
      COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
    )
    ON CONFLICT ON CONSTRAINT profiles_username_key DO NOTHING
    RETURNING id INTO v_profile_id;

    EXIT WHEN v_profile_id IS NOT NULL;
    v_suffix := v_suffix + 1;
    v_username := v_username_base || v_suffix::text;
  END LOOP;

  SELECT public.is_blacklisted(new.email, NULL) INTO v_blacklisted;

  IF v_blacklisted THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'banned');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'pending');

    IF v_access_intent = 'fan-zone' THEN
      INSERT INTO public.fan_zone_members (user_id, status, fan_alias)
      VALUES (
        new.id,
        'pending',
        COALESCE(NULLIF(btrim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1))
      )
      ON CONFLICT (user_id) DO NOTHING;
    ELSE
      INSERT INTO public.gate_applications (user_id) VALUES (new.id) RETURNING id INTO new_app_id;
      INSERT INTO public.gate_messages (application_id, sender_id, content)
      VALUES (new_app_id, new.id, 'Hi! I would like to join the server.');
    END IF;
  END IF;

  RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;