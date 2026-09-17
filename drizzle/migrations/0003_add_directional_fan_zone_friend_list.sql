CREATE OR REPLACE FUNCTION public.fan_zone_friend_list(_target_user_id uuid)
RETURNS TABLE (
  friendship_id uuid,
  user_id uuid,
  fan_alias text,
  fan_avatar_url text,
  mutual boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    f.id AS friendship_id,
    f.addressee_id AS user_id,
    m.fan_alias,
    m.fan_avatar_url,
    EXISTS (
      SELECT 1
      FROM public.fan_zone_friendships reverse_friendship
      WHERE reverse_friendship.requester_id = f.addressee_id
        AND reverse_friendship.addressee_id = f.requester_id
        AND reverse_friendship.status = 'accepted'
    ) AS mutual
  FROM public.fan_zone_friendships f
  LEFT JOIN public.fan_zone_members m ON m.user_id = f.addressee_id
  WHERE f.requester_id = _target_user_id
    AND f.status = 'accepted'
    AND auth.uid() IS NOT NULL
    AND (
      auth.uid() = _target_user_id
      OR public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::public.app_role[])
      OR (
        public.is_fan_zone_member(auth.uid())
        AND NOT COALESCE((
          SELECT target.hide_friends
          FROM public.fan_zone_members target
          WHERE target.user_id = _target_user_id
        ), false)
      )
    )
  ORDER BY f.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.fan_zone_friend_list(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fan_zone_friend_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fan_zone_friend_list(uuid) TO service_role;