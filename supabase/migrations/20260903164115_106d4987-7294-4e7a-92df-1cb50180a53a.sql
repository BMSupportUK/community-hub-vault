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
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

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

INSERT INTO public.fan_zone_members (
  user_id,
  status,
  requested_at,
  decided_at,
  fan_alias
)
SELECT
  ur.user_id,
  'approved'::public.fan_zone_status,
  COALESCE(si.created_at, ur.created_at, now()),
  COALESCE(ur.created_at, si.created_at, now()),
  COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), 'Boro Fan')
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.id = ur.user_id
LEFT JOIN LATERAL (
  SELECT s.created_at
  FROM public.signup_info s
  WHERE s.user_id = ur.user_id
    AND s.extra->>'access_intent' = 'fan-zone'
  ORDER BY s.created_at DESC
  LIMIT 1
) si ON true
WHERE ur.role = 'boro_fan_zone_member'
  AND NOT EXISTS (
    SELECT 1 FROM public.fan_zone_members m WHERE m.user_id = ur.user_id
  )
ON CONFLICT (user_id) DO NOTHING;