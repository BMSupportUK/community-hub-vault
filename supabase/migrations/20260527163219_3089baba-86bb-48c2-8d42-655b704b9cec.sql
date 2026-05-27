CREATE OR REPLACE FUNCTION public.fan_zone_staff_directory()
 RETURNS TABLE(user_id uuid, role app_role, fan_alias text, fan_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    ur.user_id,
    ur.role,
    COALESCE(NULLIF(fzm.fan_alias, ''), NULLIF(p.display_name, ''), NULLIF(p.username, ''), 'Boro Fan') AS fan_alias,
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