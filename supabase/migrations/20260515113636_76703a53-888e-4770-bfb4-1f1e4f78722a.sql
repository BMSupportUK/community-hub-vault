CREATE POLICY "Approved view staff shifts"
ON public.shifts
FOR SELECT
TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'pending'::app_role)
  AND NOT public.has_role(auth.uid(), 'banned'::app_role)
  AND public.has_any_role(user_id, ARRAY['admin','management','staff','moderator']::app_role[])
);

CREATE POLICY "Approved view staff breaks"
ON public.breaks
FOR SELECT
TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'pending'::app_role)
  AND NOT public.has_role(auth.uid(), 'banned'::app_role)
  AND public.has_any_role(user_id, ARRAY['admin','management','staff','moderator']::app_role[])
);