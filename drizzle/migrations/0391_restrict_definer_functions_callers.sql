REVOKE EXECUTE ON FUNCTION public.get_fantasy_reminder_recipients() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_fantasy_reminder_recipients() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_boro_reminder_recipients() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_boro_reminder_recipients() TO service_role;

CREATE OR REPLACE FUNCTION public.caller_is_staff_or_fan_zone()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin','management','staff','moderator','boro_fan_zone_moderator'))
    OR EXISTS (SELECT 1 FROM public.fan_zone_members WHERE user_id = auth.uid() AND status = 'approved'));
$$;
REVOKE EXECUTE ON FUNCTION public.caller_is_staff_or_fan_zone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_is_staff_or_fan_zone() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.caller_is_approved_member_or_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin','management','staff','moderator'))
    OR (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('member','subscriber','nonsubscriber'))
        AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('pending','banned','rejected'))));
$$;
REVOKE EXECUTE ON FUNCTION public.caller_is_approved_member_or_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_is_approved_member_or_staff() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fan_zone_protected_user_ids()
 RETURNS TABLE(user_id uuid, role app_role)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ur.user_id, ur.role
  FROM public.user_roles ur
  WHERE ur.role IN ('admin'::app_role, 'management'::app_role, 'moderator'::app_role, 'boro_fan_zone_moderator'::app_role)
    AND public.caller_is_staff_or_fan_zone();
$function$;

CREATE OR REPLACE FUNCTION public.directory_extra_profiles()
 RETURNS TABLE(credential_id uuid, owner_id uuid, app_login_name text, account_number integer, created_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'private', 'public'
AS $function$
  select c.id, c.owner_id, c.app_login_name,
    case when public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'management')
              or public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'moderator')
         then c.account_number else null end,
    c.created_at
  from private.app_credentials c
  where public.caller_is_approved_member_or_staff()
    and c.owner_id is not null
    and coalesce(c.account_number,1) >= 2
    and c.app_login_name is not null
  order by c.created_at desc
$function$;

CREATE OR REPLACE FUNCTION public.forum_mention_candidates()
 RETURNS TABLE(user_id uuid, display_name text, username text, avatar_url text, is_staff boolean, staff_role app_role)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT fzm.user_id FROM public.fan_zone_members fzm WHERE fzm.status = 'approved'
    UNION
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','management','staff','moderator')
  ),
  staff AS (
    SELECT DISTINCT ON (ur.user_id) ur.user_id, ur.role
    FROM public.user_roles ur
    WHERE ur.role IN ('admin','management','staff','moderator')
    ORDER BY ur.user_id,
      CASE ur.role WHEN 'admin' THEN 1 WHEN 'management' THEN 2 WHEN 'staff' THEN 3 WHEN 'moderator' THEN 4 END
  )
  SELECT p.id, p.display_name, p.username, p.avatar_url, (s.user_id IS NOT NULL), s.role
  FROM allowed a
  JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN staff s ON s.user_id = a.user_id
  WHERE public.caller_is_staff_or_fan_zone();
$function$;