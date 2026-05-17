
CREATE TABLE IF NOT EXISTS public.new_content_reads (
  user_id uuid NOT NULL,
  post_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_new_content_reads_post ON public.new_content_reads(post_id);

ALTER TABLE public.new_content_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "new_content_reads read self" ON public.new_content_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "new_content_reads insert self" ON public.new_content_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "new_content_reads update self" ON public.new_content_reads
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "new_content_reads delete self" ON public.new_content_reads
  FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS new_content_baseline_at timestamptz;
