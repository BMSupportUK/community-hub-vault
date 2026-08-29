CREATE POLICY "Members can view shop-media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'shop-media');

CREATE POLICY "Owner and management can upload shop-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'shop-media'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
);

CREATE POLICY "Owner and management can update shop-media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'shop-media'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
);

CREATE POLICY "Owner and management can delete shop-media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'shop-media'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
);