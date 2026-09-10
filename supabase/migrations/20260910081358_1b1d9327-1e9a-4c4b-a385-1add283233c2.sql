CREATE OR REPLACE FUNCTION public.talk_channel_member_directory_for_channel(_channel uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  equipped_nameplate_id uuid,
  custom_status text,
  roles app_role[],
  created_at timestamptz,
  last_seen_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    p.equipped_nameplate_id,
    p.custom_status,
    array_agg(DISTINCT ur.role ORDER BY ur.role) AS roles,
    p.created_at,
    p.last_seen_at
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE auth.uid() IS NOT NULL
    AND public.can_in_channel(auth.uid(), _channel, 'view')
    AND NOT ur.role = ANY(ARRAY['pending','banned','rejected']::app_role[])
    AND public.can_in_channel(p.id, _channel, 'view')
  GROUP BY p.id, p.display_name, p.username, p.avatar_url, p.equipped_nameplate_id, p.custom_status, p.created_at, p.last_seen_at
$$;

REVOKE ALL ON FUNCTION public.talk_channel_member_directory_for_channel(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.talk_channel_member_directory_for_channel(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.talk_channel_member_directory_for_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.talk_channel_member_directory_for_channel(uuid) TO service_role;