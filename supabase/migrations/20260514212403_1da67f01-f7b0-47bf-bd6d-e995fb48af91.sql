DROP POLICY IF EXISTS "notif read staff" ON public.staff_notifications;

CREATE POLICY "notif read staff"
ON public.staff_notifications
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN kind IN ('gate_application', 'order_placed')
      THEN has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
    ELSE has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'moderator'::app_role, 'staff'::app_role])
  END
);