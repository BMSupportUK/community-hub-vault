CREATE OR REPLACE FUNCTION public.fan_zone_admin_avatar()
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT '/__l5e/assets-v1/c757fb8f-21b2-492d-87ed-7f286f7d1645/admin-avatar.png'::text $$;

CREATE OR REPLACE FUNCTION public.set_my_fan_profile(_alias text, _avatar text, _bio text, _supporter_since integer, _fav_player text, _matchday_memory text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _is_staff boolean; _locked boolean; _is_mod boolean; _is_admin boolean; _existing text; _final_avatar text;
BEGIN
  IF _alias IS NOT NULL AND char_length(_alias) > 64 THEN RAISE EXCEPTION 'Alias too long'; END IF;
  IF _avatar IS NOT NULL AND char_length(_avatar) > 2048 THEN RAISE EXCEPTION 'Avatar URL too long'; END IF;
  IF _bio IS NOT NULL AND char_length(_bio) > 500 THEN RAISE EXCEPTION 'Bio too long (max 500)'; END IF;
  IF _fav_player IS NOT NULL AND char_length(_fav_player) > 80 THEN RAISE EXCEPTION 'Favourite player too long'; END IF;
  IF _matchday_memory IS NOT NULL AND char_length(_matchday_memory) > 280 THEN RAISE EXCEPTION 'Memory too long (max 280)'; END IF;
  IF _supporter_since IS NOT NULL AND (_supporter_since < 1876 OR _supporter_since > EXTRACT(YEAR FROM now())::int) THEN
    RAISE EXCEPTION 'Invalid supporter-since year';
  END IF;

  _is_staff := public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role,'moderator'::app_role,'boro_fan_zone_moderator'::app_role]);
  _locked := public.fan_zone_avatar_locked(auth.uid());
  _is_mod := public.has_any_role(auth.uid(), ARRAY['moderator'::app_role,'boro_fan_zone_moderator'::app_role]);
  _is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  SELECT fan_avatar_url INTO _existing FROM public.fan_zone_members WHERE user_id = auth.uid();

  IF _is_admin THEN
    _final_avatar := public.fan_zone_admin_avatar();
  ELSIF _is_mod THEN
    _final_avatar := public.fan_zone_moderator_avatar();
  ELSIF _locked THEN
    _final_avatar := _existing;
  ELSE
    _final_avatar := NULLIF(btrim(_avatar),'');
  END IF;

  IF _is_staff THEN
    INSERT INTO public.fan_zone_members (user_id, status, fan_alias, fan_avatar_url, bio, supporter_since, fav_player, matchday_memory, decided_at)
    VALUES (auth.uid(), 'approved'::fan_zone_status,
      NULLIF(btrim(_alias),''), _final_avatar,
      NULLIF(btrim(_bio),''), _supporter_since,
      NULLIF(btrim(_fav_player),''), NULLIF(btrim(_matchday_memory),''),
      now())
    ON CONFLICT (user_id) DO UPDATE
      SET fan_alias = NULLIF(btrim(_alias),''),
          fan_avatar_url = _final_avatar,
          bio = NULLIF(btrim(_bio),''),
          supporter_since = _supporter_since,
          fav_player = NULLIF(btrim(_fav_player),''),
          matchday_memory = NULLIF(btrim(_matchday_memory),''),
          status = CASE WHEN public.fan_zone_members.status = 'approved'::fan_zone_status
                        THEN public.fan_zone_members.status ELSE 'approved'::fan_zone_status END,
          decided_at = COALESCE(public.fan_zone_members.decided_at, now());
    RETURN;
  END IF;

  UPDATE public.fan_zone_members
    SET fan_alias = NULLIF(btrim(_alias),''),
        fan_avatar_url = _final_avatar,
        bio = NULLIF(btrim(_bio),''),
        supporter_since = _supporter_since,
        fav_player = NULLIF(btrim(_fav_player),''),
        matchday_memory = NULLIF(btrim(_matchday_memory),'')
    WHERE user_id = auth.uid() AND status IN ('approved'::fan_zone_status,'pending'::fan_zone_status);
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a Boro Fan Zone member'; END IF;
END;
$function$;

UPDATE public.fan_zone_members m
SET fan_avatar_url = public.fan_zone_admin_avatar()
WHERE public.has_role(m.user_id, 'admin'::app_role);