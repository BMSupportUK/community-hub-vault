UPDATE public.fan_zone_members AS fzm
SET fan_alias = left(btrim(coalesce(p.display_name, p.username, 'Boro Fan')), 64)
FROM public.profiles AS p
WHERE p.id = fzm.user_id
  AND fzm.status = 'approved'
  AND nullif(btrim(coalesce(fzm.fan_alias, '')), '') IS NULL;

CREATE OR REPLACE FUNCTION public.list_fan_zone_approved_members()
RETURNS TABLE (
  user_id uuid,
  status text,
  requested_at timestamptz,
  decided_at timestamptz,
  fan_alias text,
  fan_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.user_id,
    m.status::text,
    m.requested_at,
    m.decided_at,
    COALESCE(NULLIF(btrim(m.fan_alias), ''), 'Boro Fan') AS fan_alias,
    COALESCE(NULLIF(btrim(m.fan_avatar_url), ''), public.fan_zone_default_avatar_url()) AS fan_avatar_url
  FROM public.fan_zone_members m
  WHERE m.status = 'approved'
    AND (
      public.is_fan_zone_member(auth.uid())
      OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'boro_fan_zone_moderator'::app_role])
    )
  ORDER BY lower(COALESCE(NULLIF(btrim(m.fan_alias), ''), 'Boro Fan')) ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_fan_zone_approved_members() TO authenticated;