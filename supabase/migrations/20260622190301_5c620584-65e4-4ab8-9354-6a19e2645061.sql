DROP POLICY IF EXISTS "roles read self" ON public.user_roles;
CREATE POLICY "roles read authenticated"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (true);