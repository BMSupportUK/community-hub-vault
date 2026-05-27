CREATE OR REPLACE FUNCTION public.set_my_fan_alias(_alias text, _avatar text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_staff boolean;
BEGIN
  IF _alias IS NOT NULL AND char_length(_alias) > 64 THEN
    RAISE EXCEPTION 'Alias too long (max 64 characters)';
  END IF;
  IF _avatar IS NOT NULL AND char_length(_avatar) > 2048 THEN
    RAISE EXCEPTION 'Avatar URL too long';
  END IF;

  _is_staff := public.has_any_role(
    auth.uid(),
    ARRAY['admin'::app_role, 'management'::app_role, 'moderator'::app_role, 'boro_fan_zone_moderator'::app_role]
  );

  IF _is_staff THEN
    INSERT INTO public.fan_zone_members (user_id, status, fan_alias, fan_avatar_url, decided_at)
    VALUES (
      auth.uid(),
      'approved',
      NULLIF(btrim(_alias), ''),
      NULLIF(btrim(_avatar), ''),
      now()
    )
    ON CONFLICT (user_id) DO UPDATE
      SET fan_alias = NULLIF(btrim(_alias), ''),
          fan_avatar_url = NULLIF(btrim(_avatar), ''),
          status = CASE WHEN public.fan_zone_members.status = 'approved'
                        THEN public.fan_zone_members.status
                        ELSE 'approved' END,
          decided_at = COALESCE(public.fan_zone_members.decided_at, now());
    RETURN;
  END IF;

  UPDATE public.fan_zone_members
    SET fan_alias = NULLIF(btrim(_alias), ''),
        fan_avatar_url = NULLIF(btrim(_avatar), '')
    WHERE user_id = auth.uid()
      AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not an approved Boro Fan Zone member';
  END IF;
END;
$function$;