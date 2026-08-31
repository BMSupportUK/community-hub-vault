ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_status text;

COMMENT ON COLUMN public.profiles.custom_status IS 'Short custom status message shown under the nameplate in talk channels, e.g. "Travelling home".';

DROP FUNCTION IF EXISTS public.talk_channel_member_directory();

CREATE FUNCTION public.talk_channel_member_directory()
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
    AND EXISTS (
      SELECT 1
      FROM public.user_roles caller_role
      WHERE caller_role.user_id = auth.uid()
    )
    AND NOT ur.role = ANY(ARRAY['pending','banned','rejected']::app_role[])
  GROUP BY p.id, p.display_name, p.username, p.avatar_url, p.equipped_nameplate_id, p.custom_status, p.created_at, p.last_seen_at
$$;

REVOKE ALL ON FUNCTION public.talk_channel_member_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talk_channel_member_directory() TO authenticated;
