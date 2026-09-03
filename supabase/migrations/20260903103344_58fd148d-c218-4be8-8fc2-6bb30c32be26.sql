DROP POLICY IF EXISTS "fan_zone insert self pending" ON public.fan_zone_members;

CREATE POLICY "fan_zone insert self pending"
ON public.fan_zone_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'::fan_zone_status
  AND NOT public.has_role(auth.uid(), 'banned'::app_role)
);