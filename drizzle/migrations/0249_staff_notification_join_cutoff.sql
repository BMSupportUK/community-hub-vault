CREATE OR REPLACE FUNCTION public.staff_notification_started_at()
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT min(created_at) FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role IN ('admin'::public.app_role, 'management'::public.app_role, 'staff'::public.app_role, 'moderator'::public.app_role)
$$;
REVOKE ALL ON FUNCTION public.staff_notification_started_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_notification_started_at() TO authenticated, service_role;
CREATE INDEX IF NOT EXISTS user_roles_staff_notification_start_idx
ON public.user_roles(user_id, created_at)
WHERE role IN ('admin'::public.app_role, 'management'::public.app_role, 'staff'::public.app_role, 'moderator'::public.app_role);
CREATE POLICY "staff notifications since joining"
ON public.staff_notifications AS RESTRICTIVE FOR SELECT TO authenticated
USING (created_at >= (SELECT public.staff_notification_started_at()));
COMMENT ON FUNCTION public.staff_notification_started_at() IS 'Current caller earliest active staff role timestamp; historical shared alerts stay hidden when members become staff.';