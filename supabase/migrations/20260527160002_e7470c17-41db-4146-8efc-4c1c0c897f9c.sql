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
        ARRAY['admin'::app_role, 'management'::app_role, 'moderator'::app_role, 'boro_fan_zone_moderator'::app_role]
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
    COALESCE(fm.fan_avatar_url, p.avatar_url) AS avatar_url
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.fan_zone_members fm
    ON fm.user_id = ur.user_id AND fm.status = 'approved'
  WHERE ur.role IN ('admin'::app_role, 'boro_fan_zone_moderator'::app_role)
    AND (SELECT allowed FROM viewer) = true;
$function$;

GRANT EXECUTE ON FUNCTION public.fan_zone_staff_directory() TO authenticated;