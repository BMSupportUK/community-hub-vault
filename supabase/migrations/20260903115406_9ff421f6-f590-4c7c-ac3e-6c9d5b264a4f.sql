DROP POLICY IF EXISTS "fan_zone admin manage" ON public.fan_zone_members;

CREATE POLICY "fan_zone owner insert" ON public.fan_zone_members FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "fan_zone owner update" ON public.fan_zone_members FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "fan_zone owner delete" ON public.fan_zone_members FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));