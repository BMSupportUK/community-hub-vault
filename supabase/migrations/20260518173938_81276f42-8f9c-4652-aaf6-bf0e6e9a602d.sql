DROP POLICY IF EXISTS "chan_perms read" ON public.channel_permissions;

CREATE POLICY "chan_perms read"
ON public.channel_permissions
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
  OR has_role(auth.uid(), 'staff'::app_role)
);