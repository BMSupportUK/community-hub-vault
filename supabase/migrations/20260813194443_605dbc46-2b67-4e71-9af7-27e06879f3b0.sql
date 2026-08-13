-- Staff directory: Fan Zone alias only (no BM Support name fallback)
CREATE OR REPLACE FUNCTION public.fan_zone_staff_directory()
RETURNS TABLE(user_id uuid, role app_role, fan_alias text, fan_avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    ur.user_id,
    ur.role,
    COALESCE(NULLIF(btrim(fzm.fan_alias), ''), 'Boro Fan') AS fan_alias,
    COALESCE(NULLIF(fzm.fan_avatar_url, ''), public.fan_zone_default_avatar_url()) AS fan_avatar_url
  FROM public.user_roles ur
  LEFT JOIN public.fan_zone_members fzm ON fzm.user_id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role IN ('admin'::app_role, 'boro_fan_zone_moderator'::app_role)
    AND (
      public.is_fan_zone_member(auth.uid())
      OR public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[])
    );
$function$;

-- Fan Zone profile: Fan Zone alias only + Fan Zone privacy flag
DROP FUNCTION IF EXISTS public.get_fan_zone_profile(uuid);
CREATE FUNCTION public.get_fan_zone_profile(_user_id uuid)
RETURNS TABLE(
  user_id uuid,
  fan_alias text,
  fan_avatar_url text,
  bio text,
  supporter_since smallint,
  fav_player text,
  matchday_memory text,
  joined_at timestamp with time zone,
  is_blocked_by_me boolean,
  has_blocked_me boolean,
  is_private boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.is_fan_zone_member(auth.uid())
    OR public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[])
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    COALESCE(NULLIF(btrim(fzm.fan_alias), ''), 'Boro Fan') AS fan_alias,
    COALESCE(NULLIF(fzm.fan_avatar_url, ''), public.fan_zone_default_avatar_url()) AS fan_avatar_url,
    fzm.bio,
    fzm.supporter_since,
    fzm.fav_player,
    fzm.matchday_memory,
    COALESCE(fzm.decided_at, fzm.requested_at, p.created_at) AS joined_at,
    EXISTS (
      SELECT 1 FROM public.fan_zone_blocks
      WHERE blocker_id = auth.uid() AND blocked_id = _user_id
    ) AS is_blocked_by_me,
    EXISTS (
      SELECT 1 FROM public.fan_zone_blocks
      WHERE blocker_id = _user_id AND blocked_id = auth.uid()
    ) AS has_blocked_me,
    COALESCE(fzm.is_private, false) AS is_private
  FROM public.profiles p
  LEFT JOIN public.fan_zone_members fzm
    ON fzm.user_id = p.id AND fzm.status = 'approved'
  WHERE p.id = _user_id
    AND (
      fzm.user_id IS NOT NULL
      OR public.has_any_role(p.id, ARRAY['admin','boro_fan_zone_moderator']::app_role[])
    );
END;
$function$;

-- Fan Zone privacy flags for a set of members (used for "Private profile" notices)
CREATE OR REPLACE FUNCTION public.fan_zone_privacy(_ids uuid[])
RETURNS TABLE(user_id uuid, is_private boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u AS user_id, COALESCE(fzm.is_private, false) AS is_private
  FROM unnest(_ids) AS u
  LEFT JOIN public.fan_zone_members fzm ON fzm.user_id = u
  WHERE public.is_fan_zone_member(auth.uid())
     OR public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[]);
$function$;

-- Members set only their own Fan Zone privacy; membership status is untouched
CREATE OR REPLACE FUNCTION public.fan_zone_set_privacy(_private boolean)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.fan_zone_members
  SET is_private = COALESCE(_private, false), updated_at = now()
  WHERE user_id = auth.uid();

  RETURN COALESCE(_private, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.fan_zone_privacy(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.fan_zone_set_privacy(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.fan_zone_privacy(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fan_zone_set_privacy(boolean) TO authenticated;