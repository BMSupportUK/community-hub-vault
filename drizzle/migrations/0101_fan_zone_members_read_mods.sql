DROP POLICY IF EXISTS "fan_zone read own or admin" ON public.fan_zone_members;
CREATE POLICY "fan_zone read own or admin" ON public.fan_zone_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'boro_fan_zone_moderator'::app_role));