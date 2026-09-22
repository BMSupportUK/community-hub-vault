CREATE POLICY "Admins upload email asset files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'email-assets' AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));

CREATE POLICY "Admins update email asset files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'email-assets' AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));

CREATE POLICY "Admins delete email asset files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'email-assets' AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));

CREATE POLICY "Admins read email asset files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'email-assets' AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));