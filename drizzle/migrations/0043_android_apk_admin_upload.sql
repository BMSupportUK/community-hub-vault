CREATE POLICY "android-app admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'android-app' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "android-app admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'android-app' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "android-app admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'android-app' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "android-app admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'android-app' AND public.has_role(auth.uid(), 'admin'));