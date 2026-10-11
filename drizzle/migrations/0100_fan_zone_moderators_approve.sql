DROP POLICY IF EXISTS "fan_zone owner update" ON public.fan_zone_members;
CREATE POLICY "fan_zone owner update" ON public.fan_zone_members FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'boro_fan_zone_moderator'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'boro_fan_zone_moderator'::app_role));