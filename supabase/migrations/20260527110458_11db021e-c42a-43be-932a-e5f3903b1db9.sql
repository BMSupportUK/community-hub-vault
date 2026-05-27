CREATE OR REPLACE FUNCTION public.forum_mention_candidates()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  is_staff boolean,
  staff_role app_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed AS (
    -- Approved fan zone members
    SELECT fzm.user_id
    FROM public.fan_zone_members fzm
    WHERE fzm.status = 'approved'
    UNION
    -- Staff roles
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin','management','staff','moderator')
  ),
  staff AS (
    SELECT DISTINCT ON (ur.user_id) ur.user_id, ur.role
    FROM public.user_roles ur
    WHERE ur.role IN ('admin','management','staff','moderator')
    ORDER BY ur.user_id,
      CASE ur.role
        WHEN 'admin' THEN 1
        WHEN 'management' THEN 2
        WHEN 'staff' THEN 3
        WHEN 'moderator' THEN 4
      END
  )
  SELECT
    p.id AS user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    (s.user_id IS NOT NULL) AS is_staff,
    s.role AS staff_role
  FROM allowed a
  JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN staff s ON s.user_id = a.user_id;
$$;

REVOKE ALL ON FUNCTION public.forum_mention_candidates() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.forum_mention_candidates() TO authenticated;