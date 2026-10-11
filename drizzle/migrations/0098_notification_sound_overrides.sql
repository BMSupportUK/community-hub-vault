CREATE TABLE public.notification_sound_overrides (
  sound_key text PRIMARY KEY,
  url text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_sound_overrides TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.notification_sound_overrides TO authenticated;
GRANT ALL ON public.notification_sound_overrides TO service_role;
ALTER TABLE public.notification_sound_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads sound overrides" ON public.notification_sound_overrides FOR SELECT USING (true);
CREATE POLICY "Admins manage sound overrides" ON public.notification_sound_overrides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));

CREATE POLICY "Signed-in read notification sounds" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'notification-sounds');
CREATE POLICY "Admins upload notification sounds" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notification-sounds' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')));
CREATE POLICY "Admins update notification sounds" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'notification-sounds' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')));
CREATE POLICY "Admins delete notification sounds" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'notification-sounds' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')));