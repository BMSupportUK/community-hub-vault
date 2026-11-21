CREATE POLICY "only admins grant admin" ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (role <> 'admin'::public.app_role OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "only admins change admin" ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (role <> 'admin'::public.app_role OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (role <> 'admin'::public.app_role OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "only admins remove admin" ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (role <> 'admin'::public.app_role OR public.has_role(auth.uid(), 'admin'::public.app_role));