
ALTER TABLE public.status_incidents
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.status_incident_updates
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public)
VALUES ('status-attachments', 'status-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "status attachments public read" ON storage.objects;
CREATE POLICY "status attachments public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'status-attachments');

DROP POLICY IF EXISTS "status attachments auth upload" ON storage.objects;
CREATE POLICY "status attachments auth upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'status-attachments');

DROP POLICY IF EXISTS "status attachments staff delete" ON storage.objects;
CREATE POLICY "status attachments staff delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'status-attachments'
    AND public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::app_role[])
  );
