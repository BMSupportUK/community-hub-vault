DROP POLICY IF EXISTS "nav_order readable by all" ON public.nav_order;
CREATE POLICY "nav_order readable by authenticated"
  ON public.nav_order
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "page_permissions readable by all" ON public.page_permissions;
CREATE POLICY "page_permissions readable by authenticated"
  ON public.page_permissions
  FOR SELECT TO authenticated
  USING (true);
