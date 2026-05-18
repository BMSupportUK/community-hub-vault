-- Remove discount_codes from Realtime so user-targeted codes are not broadcast
ALTER PUBLICATION supabase_realtime DROP TABLE public.discount_codes;

-- Tighten ticket-attachments upload: path must start with the uploader's user id
DROP POLICY IF EXISTS "ticket attachments auth upload" ON storage.objects;

CREATE POLICY "ticket attachments auth upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ticket-attachments'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);