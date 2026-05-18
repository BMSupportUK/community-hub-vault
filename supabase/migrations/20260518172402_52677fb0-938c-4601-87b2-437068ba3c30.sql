
-- Restrict status-attachments uploads to staff roles
DROP POLICY IF EXISTS "status attachments auth upload" ON storage.objects;

CREATE POLICY "status attachments staff upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'status-attachments'
  AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'staff'::app_role])
);

-- Restrict ticket-attachments reads to staff or the ticket owner
DROP POLICY IF EXISTS "ticket attachments auth read" ON storage.objects;

CREATE POLICY "ticket attachments owner or staff read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ticket-attachments'
  AND (
    has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'staff'::app_role, 'moderator'::app_role])
    OR EXISTS (
      SELECT 1
      FROM public.ticket_messages tm
      JOIN public.tickets t ON t.id = tm.ticket_id
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tm.attachments, '[]'::jsonb)) AS att
      WHERE t.user_id = auth.uid()
        AND att->>'path' = storage.objects.name
    )
  )
);
