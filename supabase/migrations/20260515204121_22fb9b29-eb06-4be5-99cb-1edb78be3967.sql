
ALTER TABLE public.ticket_messages
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ticket attachments auth read" ON storage.objects;
CREATE POLICY "ticket attachments auth read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'ticket-attachments');

DROP POLICY IF EXISTS "ticket attachments auth upload" ON storage.objects;
CREATE POLICY "ticket attachments auth upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ticket-attachments');

DROP POLICY IF EXISTS "ticket attachments staff delete" ON storage.objects;
CREATE POLICY "ticket attachments staff delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::app_role[])
  );
