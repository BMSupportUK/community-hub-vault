CREATE OR REPLACE FUNCTION public.is_forum_moderator(_user uuid, _board uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_any_role(_user, ARRAY['admin','boro_fan_zone_moderator']::app_role[])
    OR EXISTS (SELECT 1 FROM public.forum_board_moderators WHERE board_id = _board AND user_id = _user);
$function$;

CREATE OR REPLACE FUNCTION public.forum_board_allows(_user uuid, _board uuid, _action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_has_config boolean;
BEGIN
  IF public.has_any_role(_user, ARRAY['admin','boro_fan_zone_moderator']::app_role[]) THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM public.forum_board_moderators
             WHERE board_id = _board AND user_id = _user) THEN
    RETURN true;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.forum_board_permissions WHERE board_id = _board)
    INTO v_has_config;

  IF v_has_config THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.forum_board_permissions p
      JOIN public.user_roles ur ON ur.role = p.role
      WHERE p.board_id = _board
        AND ur.user_id = _user
        AND CASE _action
              WHEN 'view'         THEN p.can_view
              WHEN 'create_topic' THEN p.can_create_topic
              WHEN 'reply'        THEN p.can_reply
              ELSE false
            END
    );
  END IF;

  RETURN public.is_fan_zone_member(_user);
END
$function$;

CREATE OR REPLACE FUNCTION public.forum_increment_view(_topic uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.is_fan_zone_member(auth.uid())
    OR public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[])
  ) THEN
    RETURN;
  END IF;
  UPDATE public.forum_topics SET view_count = view_count + 1 WHERE id = _topic;
END
$function$;

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
    ARRAY['admin'::app_role, 'boro_fan_zone_moderator'::app_role]
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

CREATE OR REPLACE FUNCTION public.fan_zone_aliases(_ids uuid[])
 RETURNS TABLE(user_id uuid, fan_alias text, fan_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.user_id,
    m.fan_alias,
    COALESCE(m.fan_avatar_url, public.fan_zone_default_avatar_url()) AS fan_avatar_url
  FROM public.fan_zone_members m
  WHERE m.status = 'approved'
    AND m.user_id = ANY(_ids)
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'boro_fan_zone_moderator'::app_role])
      OR EXISTS (
        SELECT 1 FROM public.fan_zone_members me
        WHERE me.user_id = auth.uid() AND me.status = 'approved'
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.fan_zone_staff_directory()
 RETURNS TABLE(user_id uuid, role app_role, display_name text, username text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH viewer AS (
    SELECT
      public.has_any_role(
        auth.uid(),
        ARRAY['admin'::app_role, 'boro_fan_zone_moderator'::app_role]
      )
      OR EXISTS (
        SELECT 1 FROM public.fan_zone_members me
        WHERE me.user_id = auth.uid() AND me.status = 'approved'
      ) AS allowed
  )
  SELECT
    ur.user_id,
    ur.role,
    COALESCE(fm.fan_alias, p.display_name) AS display_name,
    p.username,
    COALESCE(fm.fan_avatar_url, public.fan_zone_default_avatar_url(), p.avatar_url) AS avatar_url
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.fan_zone_members fm
    ON fm.user_id = ur.user_id AND fm.status = 'approved'
  WHERE ur.role IN ('admin'::app_role, 'boro_fan_zone_moderator'::app_role)
    AND (SELECT allowed FROM viewer) = true;
$function$;