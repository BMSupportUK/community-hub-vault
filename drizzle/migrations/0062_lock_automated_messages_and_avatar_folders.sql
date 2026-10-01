DROP POLICY IF EXISTS "Anyone can read automated messages" ON public.automated_messages;
CREATE POLICY "Staff can read automated messages" ON public.automated_messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'staff'));

DROP POLICY IF EXISTS "avatars user upload" ON storage.objects;
DROP POLICY IF EXISTS "avatars user update" ON storage.objects;
DROP POLICY IF EXISTS "avatars user delete" ON storage.objects;
CREATE POLICY "avatars user upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid()::text));
CREATE POLICY "avatars user update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid()::text))
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid()::text));
CREATE POLICY "avatars user delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid()::text));