
CREATE TABLE public.new_content_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('channel','category')),
  title TEXT NOT NULL,
  description TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_new_content_posts_kind_created ON public.new_content_posts (kind, created_at DESC);

ALTER TABLE public.new_content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view new content posts"
ON public.new_content_posts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert new content posts"
ON public.new_content_posts FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'staff')
);

CREATE POLICY "Staff can update new content posts"
ON public.new_content_posts FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'staff')
);

CREATE POLICY "Staff can delete new content posts"
ON public.new_content_posts FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'staff')
);

CREATE TRIGGER trg_new_content_posts_updated_at
BEFORE UPDATE ON public.new_content_posts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.new_content_posts;

INSERT INTO storage.buckets (id, name, public)
VALUES ('new-content-attachments', 'new-content-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can read new content attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'new-content-attachments');

CREATE POLICY "Staff can upload new content attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'new-content-attachments'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'staff')
  )
);

CREATE POLICY "Staff can delete new content attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'new-content-attachments'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'staff')
  )
);
