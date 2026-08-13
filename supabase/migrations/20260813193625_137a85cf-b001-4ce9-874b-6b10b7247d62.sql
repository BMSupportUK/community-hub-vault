CREATE OR REPLACE FUNCTION public.get_fan_zone_profile(_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  fan_alias text,
  fan_avatar_url text,
  bio text,
  supporter_since smallint,
  fav_player text,
  matchday_memory text,
  joined_at timestamptz,
  is_blocked_by_me boolean,
  has_blocked_me boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    COALESCE(NULLIF(fzm.fan_alias, ''), NULLIF(p.display_name, ''), NULLIF(p.username, ''), 'Boro Fan') AS fan_alias,
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
    ) AS has_blocked_me
  FROM public.profiles p
  LEFT JOIN public.fan_zone_members fzm
    ON fzm.user_id = p.id AND fzm.status = 'approved'
  WHERE p.id = _user_id
    AND (
      fzm.user_id IS NOT NULL
      OR public.has_any_role(p.id, ARRAY['admin','boro_fan_zone_moderator']::app_role[])
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fan_zone_profile(uuid) TO authenticated;