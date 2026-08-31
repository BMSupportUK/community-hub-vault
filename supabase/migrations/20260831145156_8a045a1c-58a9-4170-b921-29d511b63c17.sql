CREATE OR REPLACE FUNCTION public.talk_channel_member_directory()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  equipped_nameplate_id uuid,
  roles public.app_role[]
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
    array_agg(DISTINCT ur.role ORDER BY ur.role) AS roles
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles caller_role
      WHERE caller_role.user_id = auth.uid()
        AND caller_role.role NOT IN ('pending', 'banned', 'rejected')
    )
  GROUP BY p.id, p.display_name, p.username, p.avatar_url, p.equipped_nameplate_id;
$$;

REVOKE ALL ON FUNCTION public.talk_channel_member_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.talk_channel_member_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.talk_channel_member_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.talk_channel_member_directory() TO service_role;