DROP POLICY IF EXISTS "Mods can upload blog headers" ON storage.objects;
DROP POLICY IF EXISTS "Mods can update blog headers" ON storage.objects;
DROP POLICY IF EXISTS "Mods can delete blog headers" ON storage.objects;

CREATE POLICY "Mods can upload blog headers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'blog-headers'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
  )
);

CREATE POLICY "Mods can update blog headers"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'blog-headers'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
  )
);

CREATE POLICY "Mods can delete blog headers"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'blog-headers'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
  )
);