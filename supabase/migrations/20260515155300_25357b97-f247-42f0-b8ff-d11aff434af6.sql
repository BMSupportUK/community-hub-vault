
CREATE TABLE public.sports_blog_reads (
  user_id uuid NOT NULL,
  blog_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blog_id)
);

ALTER TABLE public.sports_blog_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sports_blog_reads read self" ON public.sports_blog_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "sports_blog_reads insert self" ON public.sports_blog_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "sports_blog_reads update self" ON public.sports_blog_reads
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "sports_blog_reads delete self" ON public.sports_blog_reads
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_sports_blog_reads_blog ON public.sports_blog_reads(blog_id);
