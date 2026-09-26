CREATE POLICY "app_settings public nav order read" ON public.app_settings
  FOR SELECT TO anon
  USING (key = 'landing_nav_order');