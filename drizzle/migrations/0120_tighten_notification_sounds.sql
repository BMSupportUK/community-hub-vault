DROP POLICY IF EXISTS "Anyone reads sound overrides" ON public.notification_sound_overrides;
CREATE POLICY "Signed-in read sound overrides" ON public.notification_sound_overrides FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.notification_sound_overrides FROM anon;
DROP POLICY IF EXISTS "Signed-in read notification sounds" ON storage.objects;
CREATE POLICY "Staff read notification sounds" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'notification-sounds' AND public.has_any_role(auth.uid(), ARRAY['admin','management','staff','moderator']::public.app_role[]));