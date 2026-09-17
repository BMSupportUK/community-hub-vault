CREATE TABLE public.forum_new_content_reads (
  user_id uuid PRIMARY KEY,
  last_viewed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_new_content_reads TO authenticated;
GRANT ALL ON public.forum_new_content_reads TO service_role;

ALTER TABLE public.forum_new_content_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own forum new content marker"
ON public.forum_new_content_reads
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);