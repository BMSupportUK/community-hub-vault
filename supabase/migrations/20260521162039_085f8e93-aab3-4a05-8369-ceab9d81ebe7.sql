
ALTER TABLE public.upcoming_event ADD COLUMN IF NOT EXISTS banner_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('event-banners', 'event-banners', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Event banners publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-banners');

CREATE POLICY "Staff can upload event banners"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-banners' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'management') OR
    public.has_role(auth.uid(), 'staff')
  )
);

CREATE POLICY "Staff can update event banners"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-banners' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'management') OR
    public.has_role(auth.uid(), 'staff')
  )
);

CREATE POLICY "Staff can delete event banners"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-banners' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'management') OR
    public.has_role(auth.uid(), 'staff')
  )
);
